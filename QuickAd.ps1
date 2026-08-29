$url="https://lpeledvuysdvoaorawli.supabase.co"
$skey="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwZWxlZHZ1eXNkdm9hb3Jhd2xpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Nzc5NjI5MSwiZXhwIjoyMTAzMzcyMjkxfQ.DVBuWwmrYf-m_HGpiK47BIJw8IkJdNIfQDXMFMpXZlo"
$headers = @{ "apikey"=$skey; "Authorization"="Bearer $skey"; "Content-Type"="application/json" }

function Count-Projects { 
  $r = Invoke-WebRequest -Method Get -Uri "$url/rest/v1/projects?select=id" -Headers @{ "apikey"=$skey; "Authorization"="Bearer $skey"; "Prefer"="count=exact" }
  Write-Host "Projects:" $r.Headers["content-range"] " (limit 10)" -ForegroundColor Green
}
function List-Projects { 
  Invoke-RestMethod -Method Get -Uri "$url/rest/v1/projects?select=id,name,created_at&order=created_at.desc" -Headers $headers | Format-Table id, name, created_at 
}
function Remove-ProjectHard($id) {
  $h2 = @{ "apikey"=$skey; "Authorization"="Bearer $skey"; "Content-Type"="application/json"; "Prefer"="return=representation" }
  $proj = Invoke-RestMethod -Method Get -Uri "$url/rest/v1/projects?id=eq.$id&select=image_path,video_path" -Headers $headers
  if ($proj.image_path) { Invoke-RestMethod -Method Delete -Uri "$url/storage/v1/object/quickad-files/$($proj.image_path)" -Headers $headers | Out-Null; Write-Host "Deleted $($proj.image_path)" }
  if ($proj.video_path) { Invoke-RestMethod -Method Delete -Uri "$url/storage/v1/object/quickad-files/$($proj.video_path)" -Headers $headers | Out-Null; Write-Host "Deleted $($proj.video_path)" }
  Invoke-RestMethod -Method Delete -Uri "$url/rest/v1/projects?id=eq.$id" -Headers $h2 | Out-Null
  Write-Host "HARD DELETED $id - slot freed!" -ForegroundColor Yellow
}
