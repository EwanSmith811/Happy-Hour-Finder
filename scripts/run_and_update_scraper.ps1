<#
PowerShell helper: run the Python scraper on a URL and, if happy hours found,
convert them into `weeklySchedule` + `selectedDays` and POST to the app API.

Usage:
  PS> .\scripts\run_and_update_scraper.ps1 -Url "https://www.holygrailpub.com/"

Notes:
- Run in the project root so paths resolve (project root contains `scraper_simple.py`).
- Ensure `OPENAI_API_KEY` is set in this PowerShell session before running.
- If the Next dev server is not running, the script will fall back to directly
  inserting a `user-` entry into `public/data/venues.json`.
#>
param(
  [Parameter(Mandatory=$true)][string]$Url
)

function Extract-JsonFromText {
  param([string]$text)
  # Try to find first { and last } and extract substring
  $first = $text.IndexOf('{')
  $last = $text.LastIndexOf('}')
  if ($first -ge 0 -and $last -gt $first) {
    return $text.Substring($first, $last - $first + 1)
  }
  return $null
}

Write-Host "Running scraper for: $Url"

# Run python script and capture output
$py = "python"
$script = Join-Path (Get-Location) 'scraper_simple.py'
if (-not (Test-Path $script)) {
  Write-Error "scraper_simple.py not found in current directory. Run this from project root."
  exit 1
}

$raw = & $py $script $Url 2>&1 | Out-String
if (-not $raw) {
  Write-Error "No output from scraper"
  exit 1
}

# Extract JSON object from mixed logs
$jsonText = Extract-JsonFromText -text $raw
if (-not $jsonText) {
  Write-Error "Could not find JSON output in scraper logs. Full output:\n$raw"
  exit 1
}

try {
  $scraped = $jsonText | ConvertFrom-Json -ErrorAction Stop
} catch {
  Write-Error "Failed to parse JSON from scraper output. Extracted text:\n$jsonText"
  exit 1
}

if (-not $scraped) {
  Write-Error "Scraper returned empty result"
  exit 1
}

$hh = $scraped.happyHours
if (-not $hh -or $hh.Count -eq 0) {
  Write-Host "Scraper did not find happy hours. Nothing to add."
  exit 0
}

Write-Host "Found happy hours entries: $($hh.Count)"

# Helper: normalize day to Mon/Tue/... (first three letters)
function Normalize-Day($d) {
  if (-not $d) { return $null }
  $s = $d.ToString().Trim()
  if ($s.Length -ge 3) { $t = $s.Substring(0,3).ToLower() } else { $t = $s.ToLower() }
  switch ($t) {
    'mon' { return 'Mon' }
    'tue' { return 'Tue' }
    'wed' { return 'Wed' }
    'thu' { return 'Thu' }
    'fri' { return 'Fri' }
    'sat' { return 'Sat' }
    'sun' { return 'Sun' }
    default { return $null }
  }
}

$DAYS = @('Mon','Tue','Wed','Thu','Fri','Sat','Sun')
$selectedDays = @{ }
foreach ($d in $DAYS) { $selectedDays[$d] = $false }
$weeklySchedule = @{}

foreach ($entry in $hh) {
  $entryDays = $entry.days
  if (-not $entryDays) { continue }
  foreach ($rawDay in $entryDays) {
    $day = Normalize-Day -d $rawDay
    if (-not $day) { continue }
    $selectedDays[$day] = $true
    # Build schedule for this day
    $dealsArr = @()
    if ($entry.deals) {
      foreach ($ditem in $entry.deals) {
        # each deal may be string or object; coerce to string
        $desc = $ditem
        if ($ditem -is [psobject] -and $ditem.description) { $desc = $ditem.description }
        $dealsArr += @{ description = $desc }
      }
    }
    $weeklySchedule[$day] = @{ mode = 'override'; start = $entry.startTime; end = $entry.endTime; deals = $dealsArr }
  }
}

# Build payload
$payloadBase = @{ name = $scraped.name; address = $scraped.address; website = $scraped.website }
$payload = $payloadBase + @{ weeklySchedule = $weeklySchedule; selectedDays = $selectedDays }

# Try to find existing scraped entry in public/data/venues.json
$dataPath = Join-Path (Get-Location) 'public\data\venues.json'
$foundId = $null
if (Test-Path $dataPath) {
  try {
    $all = Get-Content $dataPath -Raw | ConvertFrom-Json -ErrorAction Stop
    foreach ($v in $all) {
      if ($v.website -and $payload.website -and ($v.website.ToString().ToLower().Contains($payload.website.ToString().ToLower()) -or $payload.website.ToString().ToLower().Contains($v.website.ToString().ToLower()))) {
        $foundId = $v.id; break
      }
      if ($v.name -and $payload.name -and ($v.name.ToString().Trim().ToLower() -eq $payload.name.ToString().Trim().ToLower())) {
        $foundId = $v.id; break
      }
    }
  } catch {
    Write-Warning "Could not parse existing venues.json: $($_)"
  }
}

# HTTP helper
function Post-Json($url, $bodyObj) {
  $json = $bodyObj | ConvertTo-Json -Depth 10
  try {
    $resp = Invoke-RestMethod -Uri $url -Method Post -Body $json -ContentType 'application/json' -ErrorAction Stop
    return @{ ok = $true; resp = $resp }
  } catch {
    return @{ ok = $false; error = $_ }
  }
}

if ($foundId) {
  Write-Host "Found existing venue entry with id: $foundId - attempting /api/update-venue"
  $updateBody = @{ id = $foundId; name = $payload.name; website = $payload.website; weeklySchedule = $payload.weeklySchedule; selectedDays = $payload.selectedDays }
  $res = Post-Json -url 'http://localhost:3000/api/update-venue' -bodyObj $updateBody
  if ($res.ok) {
    Write-Host "Update successful:"; $res.resp | ConvertTo-Json
    exit 0
  } else {
    Write-Warning "Update API failed: $($res.error)"
    # Fall through to attempt add-brewery
  }
}

# Not found or update failed — try add-brewery
Write-Host "Attempting to add via /api/add-brewery"
$addBody = $payload
$addRes = Post-Json -url 'http://localhost:3000/api/add-brewery' -bodyObj $addBody
if ($addRes.ok) {
  Write-Host "Add-brewery successful:"; $addRes.resp | ConvertTo-Json
  exit 0
} else {
  Write-Warning "add-brewery API failed: $($addRes.error)"
  Write-Host "Falling back to directly writing a user entry into $dataPath"
  # Build a user- entry and insert at front of venues.json
  $newId = "user-$(Get-Date -UFormat %s)-$(Get-Random -Maximum 9999)"
  $newVenue = @{ id = $newId; name = $payload.name; address = $payload.address; website = $payload.website; lat = $scraped.lat; lng = $scraped.lng; type = 'brewery' }
  # Only include happyHours if we can produce them via weeklySchedule conversion
  $hhList = @()
  foreach ($k in $payload.selectedDays.Keys) {
    if ($payload.selectedDays[$k]) {
      $s = $payload.weeklySchedule[$k]
      if ($s) {
        $deals = @()
        if ($s.deals) { foreach ($d in $s.deals) { $deals += $d.description } }
        $hhList += @{ days = @($k); startTime = $s.start; endTime = $s.end; deals = $deals }
      }
    }
  }
  if ($hhList.Count -gt 0) { $newVenue.happyHours = $hhList }

  $existing = @()
  if (Test-Path $dataPath) {
    try { $existing = Get-Content $dataPath -Raw | ConvertFrom-Json -ErrorAction Stop } catch { $existing = @() }
  }
  $newList = ,$newVenue + $existing
  try {
    $newList | ConvertTo-Json -Depth 10 | Out-File -FilePath $dataPath -Encoding utf8
    Write-Host "Wrote new user entry to $dataPath with id $newId"
    exit 0
  } catch {
    Write-Error "Failed to write venues.json fallback: $_"
    exit 1
  }
}
