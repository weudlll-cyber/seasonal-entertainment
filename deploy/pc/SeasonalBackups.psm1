# ============================================================
# File:        SeasonalBackups.psm1
# Path:        deploy/pc/SeasonalBackups.psm1
# Project:     Seasonal Entertainment
# Description: Backups to the owner's PC (owner decision 2026-10-19; docs/DEPLOYMENT.md,
#              "Backups to your PC"). Fetches the encrypted nightly backups (<UTC time>.tar.age)
#              from the VPS with Windows' own OpenSSH client (sftp, key-based, a read-only
#              backup user), keeps a set number of them, logs every run, and catches up after
#              the PC was off: everything on the server that is not here yet is fetched (the
#              server keeps 14 days). Files arrive as ".partial" and get their name only when
#              complete. The call recordings' own backups (one per recording, since 2026-11-11)
#              go to <LocalDir>\recordings: fetched when not here yet or of another size, never
#              deleted here. Works in Windows PowerShell 5.1 and PowerShell 7.
#              Get-SeasonalBackups.ps1 runs it; SeasonalBackups.Tests.ps1 tests it.
# ============================================================

# What the server writes: its UTC time, then .tar.age (server/src/backup/encrypted.js).
$script:BackupName = '^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.tar\.age$'

# Backup file names among any names, oldest first (the names sort by time). $Names may be $null:
# a function's empty result reaches its caller as $null (a server with no archive yet, its first
# nights or only recordings/), and $null piped on still runs the block once, so it is skipped.
function Select-BackupNames {
    param([string[]] $Names)
    @($Names | Where-Object { $_ } | ForEach-Object { Split-Path -Leaf $_.Trim() } |
        Where-Object { $_ -match $script:BackupName } | Sort-Object -Unique)
}

# The backups on the server that are not on the PC yet, oldest first.
function Select-MissingBackups {
    param([string[]] $Remote, [string[]] $Local)
    @(Select-BackupNames $Remote | Where-Object { $Local -notcontains $_ })
}

# The call recordings' own backups (server/src/backup/recordings.js, since 2026-11-11) in an
# "ls -l" listing: the size is the 5th field, the path the last; only .age files.
function Select-RecordingBackups {
    param([string[]] $Lines)
    @($Lines | ForEach-Object {
            $fields = -split "$_"
            if ($fields.Count -ge 9 -and $fields[-1] -match '\.age$') {
                [pscustomobject]@{ Name = Split-Path -Leaf $fields[-1]; Size = [long] $fields[4] }
            }
        })
}

# One line with the time into the log file (and the output).
function Write-BackupLog {
    param([string] $LogFile, [string] $Message)
    $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $Message
    Add-Content -Path $LogFile -Value $line
    Write-Output $line
}

# Runs sftp with one batch command; returns its output, throws when it fails.
# Sftp: the program (or, in the tests, a script block standing in for it).
function Invoke-Sftp {
    param($Sftp, [string] $Target, [string] $KeyFile, [string] $Command)
    $batch = [System.IO.Path]::GetTempFileName()
    try {
        Set-Content -Path $batch -Value $Command -Encoding ascii
        $global:LASTEXITCODE = 0
        # BatchMode: never stop to ask for a password; the key is the only way in.
        $output = & $Sftp -b $batch -i $KeyFile -o BatchMode=yes $Target 2>&1
        if ($LASTEXITCODE -ne 0) { throw "sftp failed ($LASTEXITCODE): $($output -join ' ')" }
        @($output | ForEach-Object { "$_" })
    }
    finally {
        Remove-Item -Path $batch -Force -ErrorAction SilentlyContinue
    }
}

# Deletes the oldest backups beyond the newest $Keep, and leftovers of broken downloads.
# Returns the names removed.
function Remove-OldBackups {
    param([string] $LocalDir, [int] $Keep)
    $removed = @()
    Get-ChildItem -Path $LocalDir -Filter '*.partial' -File | ForEach-Object {
        Remove-Item -Path $_.FullName -Force
        $removed += $_.Name
    }
    $present = Select-BackupNames (Get-ChildItem -Path $LocalDir -File | ForEach-Object { $_.Name })
    if ($present.Count -gt $Keep) {
        foreach ($name in $present[0..($present.Count - $Keep - 1)]) {
            Remove-Item -Path (Join-Path $LocalDir $name) -Force
            $removed += $name
        }
    }
    $removed
}

# The whole run: list, fetch what is missing, keep $Keep, log. Throws at the end when any
# download failed (the others are kept); the next run fetches it again.
function Invoke-BackupDownload {
    param(
        [string] $Server,
        [string] $User,
        [string] $KeyFile,
        [string] $RemoteDir,
        [string] $LocalDir,
        [int] $Keep,
        [string] $LogFile,
        $Sftp = 'sftp'
    )
    New-Item -ItemType Directory -Path $LocalDir -Force | Out-Null
    $target = "$User@$Server"
    $remote = Select-BackupNames (Invoke-Sftp $Sftp $target $KeyFile "ls -1 $RemoteDir")
    $local = @(Get-ChildItem -Path $LocalDir -File | ForEach-Object { $_.Name })
    $missing = Select-MissingBackups -Remote $remote -Local $local
    Write-BackupLog $LogFile "server has $($remote.Count) backups, $($missing.Count) new"
    $failed = @()
    foreach ($name in $missing) {
        $partial = Join-Path $LocalDir "$name.partial"
        try {
            Invoke-Sftp $Sftp $target $KeyFile "get $RemoteDir/$name `"$partial`"" | Out-Null
            if (-not (Test-Path $partial)) { throw 'nothing arrived' }
            Move-Item -Path $partial -Destination (Join-Path $LocalDir $name) -Force
            Write-BackupLog $LogFile "fetched $name"
        }
        catch {
            # (A half file is swept up by Remove-OldBackups at the end of this run.)
            Write-BackupLog $LogFile "FAILED $name : $_"
            $failed += $name
        }
    }
    # The recordings' own backups into <LocalDir>\recordings: each fetched once, again when its
    # size on the server differs (backed up once more); never deleted here.
    $recordingsDir = Join-Path $LocalDir 'recordings'
    New-Item -ItemType Directory -Path $recordingsDir -Force | Out-Null
    $listing = $null
    try { $listing = Invoke-Sftp $Sftp $target $KeyFile "ls -l $RemoteDir/recordings" }
    catch { Write-BackupLog $LogFile 'recordings: none on the server yet' }
    if ($null -ne $listing) {
        $fetched = 0
        foreach ($backup in (Select-RecordingBackups $listing)) {
            $file = Join-Path $recordingsDir $backup.Name
            if ((Test-Path $file) -and (Get-Item $file).Length -eq $backup.Size) { continue }
            $partial = "$file.partial"
            try {
                Invoke-Sftp $Sftp $target $KeyFile "get $RemoteDir/recordings/$($backup.Name) `"$partial`"" | Out-Null
                if (-not (Test-Path $partial)) { throw 'nothing arrived' }
                Move-Item -Path $partial -Destination $file -Force
                $fetched++
                Write-BackupLog $LogFile "fetched recording $($backup.Name)"
            }
            catch {
                Write-BackupLog $LogFile "FAILED recording $($backup.Name) : $_"
                $failed += "recording $($backup.Name)"
            }
        }
        Get-ChildItem -Path $recordingsDir -Filter '*.partial' -File | Remove-Item -Force
        Write-BackupLog $LogFile "recordings: $fetched fetched"
    }
    foreach ($name in (Remove-OldBackups -LocalDir $LocalDir -Keep $Keep)) {
        Write-BackupLog $LogFile "removed $name (keeping $Keep)"
    }
    if ($failed.Count -gt 0) { throw "could not fetch: $($failed -join ', ')" }
    Write-BackupLog $LogFile 'done'
}

Export-ModuleMember -Function Select-BackupNames, Select-MissingBackups, Select-RecordingBackups,
    Remove-OldBackups, Write-BackupLog, Invoke-BackupDownload
