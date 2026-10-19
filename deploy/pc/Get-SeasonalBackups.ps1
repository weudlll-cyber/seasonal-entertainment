# ============================================================
# File:        Get-SeasonalBackups.ps1
# Path:        deploy/pc/Get-SeasonalBackups.ps1
# Project:     Seasonal Entertainment
# Description: Fetches the site's new encrypted backups from the VPS to this PC
#              (SeasonalBackups.psm1; docs/DEPLOYMENT.md, "Backups to your PC"). Meant for a
#              daily Windows scheduled task; can be run by hand too. Exit code 0: all fetched;
#              1: something failed (see the log). Example:
#              .\Get-SeasonalBackups.ps1 -Server example.org -KeyFile $HOME\.ssh\seasonal-backup
# ============================================================

param(
    # The VPS's name or address.
    [Parameter(Mandatory = $true)] [string] $Server,
    # The read-only backup user on the VPS (sftp only).
    [string] $User = 'seasonal-backup',
    # The SSH private key for that user (no passphrase: the task runs unattended).
    [Parameter(Mandatory = $true)] [string] $KeyFile,
    # Where the backups are, as the backup user sees them.
    [string] $RemoteDir = '/backups',
    # Where they go on this PC. Not the folder holding the age private key.
    [string] $LocalDir = (Join-Path $HOME 'SeasonalBackups'),
    # How many to keep here (the newest).
    [int] $Keep = 30,
    # The log of every run.
    [string] $LogFile = ''
)

Import-Module (Join-Path $PSScriptRoot 'SeasonalBackups.psm1') -Force
if (-not $LogFile) { $LogFile = Join-Path $LocalDir 'download.log' }
New-Item -ItemType Directory -Path $LocalDir -Force | Out-Null

try {
    Invoke-BackupDownload -Server $Server -User $User -KeyFile $KeyFile -RemoteDir $RemoteDir `
        -LocalDir $LocalDir -Keep $Keep -LogFile $LogFile
    exit 0
}
catch {
    Write-BackupLog $LogFile "RUN FAILED: $_"
    exit 1
}
