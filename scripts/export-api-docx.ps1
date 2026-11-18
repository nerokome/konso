param(
  [string]$SourceFile = (Join-Path $PSScriptRoot '..\docs\Konso API.md'),
  [string]$OutputFile = (Join-Path $PSScriptRoot '..\docs\Konso API.docx')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$sourcePath = [System.IO.Path]::GetFullPath($SourceFile)
$outputPath = [System.IO.Path]::GetFullPath($OutputFile)
$markdown = Get-Content -LiteralPath $sourcePath
if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath }
$archive = [System.IO.Compression.ZipFile]::Open($outputPath, [System.IO.Compression.ZipArchiveMode]::Create)

function Add-DocxEntry([string]$Name, [string]$Content) {
  $entry = $script:archive.CreateEntry($Name)
  $stream = $entry.Open()
  $writer = [System.IO.StreamWriter]::new($stream, [System.Text.UTF8Encoding]::new($false))
  $writer.Write($Content)
  $writer.Dispose()
  $stream.Dispose()
}

try {
  Add-DocxEntry '[Content_Types].xml' '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  Add-DocxEntry '_rels/.rels' '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  $paragraphs = foreach ($line in $markdown) {
    $text = [System.Security.SecurityElement]::Escape($line)
    if ([string]::IsNullOrWhiteSpace($line)) { '<w:p/>'; continue }
    if ($line.StartsWith('# ')) { '<w:p><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t xml:space="preserve">' + $text.Substring(2) + '</w:t></w:r></w:p>'; continue }
    if ($line.StartsWith('## ')) { '<w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">' + $text.Substring(3) + '</w:t></w:r></w:p>'; continue }
    if ($line.StartsWith('### ')) { '<w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">' + $text.Substring(4) + '</w:t></w:r></w:p>'; continue }
    '<w:p><w:r><w:t xml:space="preserve">' + $text + '</w:t></w:r></w:p>'
  }
  $body = $paragraphs -join ''
  $document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + $body + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>'
  Add-DocxEntry 'word/document.xml' $document
} finally {
  $archive.Dispose()
}

Write-Output "Created $outputPath"
