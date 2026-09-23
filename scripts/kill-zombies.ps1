# Kill zombie EDC_EXEC Fabric sessions that cause Argus query timeouts.
# Run as a Windows Scheduled Task every 5 minutes on the prod server.
# Logs kills to logs/zombie-kills.log for audit.

$logFile = Join-Path $PSScriptRoot "..\logs\zombie-kills.log"
$logDir  = Split-Path $logFile
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force $logDir | Out-Null }

# Get Entra token for Fabric warehouse
$token = $null
try {
    $token = (az account get-access-token --resource "https://database.windows.net" --query accessToken -o tsv 2>$null).Trim()
} catch {}

if (-not $token) {
    Add-Content $logFile "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') WARN: failed to get Azure token -- skipping"
    exit 0
}

$connStr = "Server=pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com,1433;Initial Catalog=LH_ProdOps_Dev;Encrypt=true;TrustServerCertificate=false;Connection Timeout=15;"
$conn = New-Object System.Data.SqlClient.SqlConnection
$conn.ConnectionString = $connStr
$conn.AccessToken = $token

try { $conn.Open() } catch {
    Add-Content $logFile "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') WARN: cannot connect to Fabric -- $_"
    exit 0
}

# Find zombie user sessions stuck on EDC_EXEC
$cmd = $conn.CreateCommand()
$cmd.CommandTimeout = 10
$cmd.CommandText = "SELECT session_id FROM sys.dm_exec_requests WHERE wait_type = 'EDC_EXEC' AND session_id > 50"
$reader = $cmd.ExecuteReader()
$sessions = @()
while ($reader.Read()) { $sessions += [int]$reader['session_id'] }
$reader.Close()

if ($sessions.Count -eq 0) {
    $conn.Close()
    exit 0
}

Add-Content $logFile "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') Found $($sessions.Count) zombie session(s): $($sessions -join ', ')"

foreach ($sid in $sessions) {
    $kc = $conn.CreateCommand()
    $kc.CommandTimeout = 5
    $kc.CommandText = "KILL $sid"
    try {
        $kc.ExecuteNonQuery() | Out-Null
        Add-Content $logFile "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') Killed session $sid"
    } catch {
        Add-Content $logFile "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') WARN: KILL $sid failed -- $_"
    }
}

$conn.Close()
