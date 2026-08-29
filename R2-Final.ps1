function Upload-ToR2 {
  param([string]$file, [string]$userId)
  if (-not (Test-Path $file)) { Write-Error "File not found: $file"; return }
  $AccessKey = "c118fea911b6a38e4d8eb69fa97dbed6"
  $SecretKey = "67f76fdc0296aa9c06e38bde9f7548a3a7aeb1e81883ccf7c5e2c7a79fed6e58"
  $AccountId = "c351fd432fd652c91709f8c14ccbf683"
  $Bucket = "quickad-videos"
  $PublicBase = "https://pub-1b8cdfbb4d4f4bdda8a968060f9b3774.r2.dev"
  $fileName = [IO.Path]::GetFileName($file)
  $key = "$userId/$fileName"
  $endpoint = "https://$AccountId.r2.cloudflarestorage.com/$Bucket/$key"
  $content = [System.IO.File]::ReadAllBytes($file)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $hashedPayload = -join ($sha.ComputeHash([byte[]]$content) | % { $_.ToString("x2") })
  $now = [DateTime]::UtcNow
  $amzDate = $now.ToString("yyyyMMddTHHmmssZ")
  $dateStamp = $now.ToString("yyyyMMdd")
  $region = "auto"; $service = "s3"
  $canonicalHeaders = "host:$AccountId.r2.cloudflarestorage.com`nx-amz-content-sha256:$hashedPayload`nx-amz-date:$amzDate`n"
  $signedHeaders = "host;x-amz-content-sha256;x-amz-date"
  $canonicalRequest = "PUT`n/$Bucket/$key`n`n$canonicalHeaders`n$signedHeaders`n$hashedPayload"
  $credentialScope = "$dateStamp/$region/$service/aws4_request"
  $hashedCanonical = -join ( [System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($canonicalRequest)) | % { $_.ToString("x2") } )
  $stringToSign = "AWS4-HMAC-SHA256`n$amzDate`n$credentialScope`n$hashedCanonical"
  $kSecret = [Text.Encoding]::UTF8.GetBytes("AWS4$SecretKey")
  $kDate = (New-Object Security.Cryptography.HMACSHA256 -ArgumentList @(,$kSecret)).ComputeHash([Text.Encoding]::UTF8.GetBytes($dateStamp))
  $kRegion = (New-Object Security.Cryptography.HMACSHA256 -ArgumentList @(,$kDate)).ComputeHash([Text.Encoding]::UTF8.GetBytes($region))
  $kService = (New-Object Security.Cryptography.HMACSHA256 -ArgumentList @(,$kRegion)).ComputeHash([Text.Encoding]::UTF8.GetBytes($service))
  $kSigning = (New-Object Security.Cryptography.HMACSHA256 -ArgumentList @(,$kService)).ComputeHash([Text.Encoding]::UTF8.GetBytes("aws4_request"))
  $signature = -join ( (New-Object Security.Cryptography.HMACSHA256 -ArgumentList @(,$kSigning)).ComputeHash([Text.Encoding]::UTF8.GetBytes($stringToSign)) | % { $_.ToString("x2") } )
  $headers = @{ "x-amz-date" = $amzDate; "x-amz-content-sha256" = $hashedPayload; "Authorization" = "AWS4-HMAC-SHA256 Credential=$AccessKey/$credentialScope, SignedHeaders=$signedHeaders, Signature=$signature" }
  Write-Host "Uploading $fileName ($($content.Length) bytes) to R2..."
  Invoke-RestMethod -Uri $endpoint -Method Put -Headers $headers -Body $content
  Write-Host "SUCCESS: $PublicBase/$key" -ForegroundColor Green
  return "$PublicBase/$key"
}
