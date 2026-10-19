# ============================================================
# File:        SeasonalBackups.Tests.ps1
# Path:        deploy/pc/SeasonalBackups.Tests.ps1
# Project:     Seasonal Entertainment
# Description: Tests of the backup download to the owner's PC (SeasonalBackups.psm1), with
#              plain checks, no test framework to install: only backup names count; a PC that
#              was off fetches everything it missed; the newest N are kept; a failed download
#              leaves no half file, the others still arrive, and the run says so; sftp always
#              runs non-interactive with the key. A script block stands in for sftp, serving
#              files from a temporary "server" folder. Run: pwsh -File SeasonalBackups.Tests.ps1
#              (or Windows PowerShell 5.1); CI runs it. Exit code 1 on any failure.
# ============================================================

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'SeasonalBackups.psm1') -Force
$script:failures = 0
$script:tempDirs = @()

function Assert-Equal($Expected, $Actual, [string] $What) {
    $e = ($Expected | ForEach-Object { "$_" }) -join ','
    $a = ($Actual | ForEach-Object { "$_" }) -join ','
    if ($e -ne $a) {
        Write-Host "FAIL $What`n  expected: $e`n  actual:   $a"
        $script:failures++
    }
    else { Write-Host "ok   $What" }
}

function New-TempDir {
    $dir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $dir | Out-Null
    $script:tempDirs += $dir
    $dir
}

function Stamp([int] $Day) { '2026-10-{0:d2}T03-30-00Z.tar.age' -f $Day }

# A stand-in for sftp over $ServerDir: "ls -1" lists it, "get" copies a file; a name in
# $FailOn makes get fail. Returns @{ Run = the stand-in; Calls = every call's arguments }.
function New-FakeSftp([string] $ServerDir, [string[]] $FailOn = @()) {
    $calls = [System.Collections.ArrayList]::new()
    $run = {
        [void] $calls.Add(@($args))
        $command = (Get-Content -Path $args[1]).Trim()
        $global:LASTEXITCODE = 0
        if ($command -like 'ls -1 *') {
            Get-ChildItem -Path $ServerDir -File | ForEach-Object { "/backups/$($_.Name)" }
        }
        elseif ($command -match '^get /backups/(\S+) "(.+)"$') {
            if ($FailOn -contains $Matches[1]) {
                Set-Content -Path $Matches[2] -Value 'half'
                $global:LASTEXITCODE = 1
                return 'Connection reset'
            }
            Copy-Item -Path (Join-Path $ServerDir $Matches[1]) -Destination $Matches[2]
        }
    }.GetNewClosure()
    @{ Run = $run; Calls = $calls }
}

function Invoke-Run($Server, $Local, $Sftp, [int] $Keep = 30) {
    Invoke-BackupDownload -Server 'vps.example' -User 'seasonal-backup' -KeyFile 'C:\key' `
        -RemoteDir '/backups' -LocalDir $Local -Keep $Keep -LogFile (Join-Path $Local 'run.log') `
        -Sftp $Sftp.Run | Out-Null
}

# --- names
Assert-Equal @((Stamp 2), (Stamp 3)) (Select-BackupNames @("/backups/$(Stamp 3)", 'notes.txt',
        "/backups/$(Stamp 2)", "$(Stamp 4).partial", 'sftp> ls -1 /backups')) 'only backup names, oldest first'
Assert-Equal @((Stamp 3)) (Select-MissingBackups -Remote @((Stamp 2), (Stamp 3)) -Local @((Stamp 2))) 'missing ones'

# --- a PC that was off catches up, keeps the newest N, uses the key non-interactively
$server = New-TempDir
$local = New-TempDir
foreach ($day in 1..5) { Set-Content -Path (Join-Path $server (Stamp $day)) -Value "backup $day" }
Set-Content -Path (Join-Path $local (Stamp 1)) -Value 'backup 1'
$sftp = New-FakeSftp $server
Invoke-Run $server $local $sftp -Keep 3
$have = Select-BackupNames (Get-ChildItem -Path $local -File | ForEach-Object { $_.Name })
Assert-Equal @((Stamp 3), (Stamp 4), (Stamp 5)) $have 'caught up, newest three kept'
Assert-Equal 'backup 5' (Get-Content -Path (Join-Path $local (Stamp 5))) 'the content arrived'
Assert-Equal 5 $sftp.Calls.Count 'one listing and four downloads (2 to 5)'
$first = $sftp.Calls[0]
Assert-Equal @('-b', '-i', 'C:\key', '-o', 'BatchMode=yes', 'seasonal-backup@vps.example') `
    @($first[0], $first[2], $first[3], $first[4], $first[5], $first[6]) 'key and batch mode, never a prompt'
$log = Get-Content -Path (Join-Path $local 'run.log')
Assert-Equal $true (($log -join "`n") -match 'server has 5 backups, 4 new') 'the log says what it found'
Assert-Equal $true (($log | Select-Object -Last 1) -match ' done$') 'the log ends with done'

# --- a failed download: no half file, the others arrive, the run fails
$server = New-TempDir
$local = New-TempDir
foreach ($day in 6..8) { Set-Content -Path (Join-Path $server (Stamp $day)) -Value "backup $day" }
$sftp = New-FakeSftp $server @((Stamp 7))
$failed = $null
try { Invoke-Run $server $local $sftp } catch { $failed = "$_" }
$have = Get-ChildItem -Path $local -File | ForEach-Object { $_.Name } | Where-Object { $_ -ne 'run.log' }
Assert-Equal @((Stamp 6), (Stamp 8)) ($have | Sort-Object) 'the others arrived, no .partial left'
Assert-Equal $true ($failed -match [regex]::Escape((Stamp 7))) 'the run fails, naming the missing backup'
# The next run fetches it once the server answers again.
Invoke-Run $server $local (New-FakeSftp $server)
Assert-Equal $true (Test-Path (Join-Path $local (Stamp 7))) 'the next run catches up'

$script:tempDirs | ForEach-Object { Remove-Item -Path $_ -Recurse -Force }
if ($script:failures -gt 0) {
    Write-Host "$script:failures check(s) failed"
    exit 1
}
Write-Host 'all checks passed'
