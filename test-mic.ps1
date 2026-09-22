Add-Type -AssemblyName System.Speech
try {
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    $engine.SetInputToDefaultAudioDevice()
    Write-Host "SUCCESS: Speech recognition engine created, mic device OK"
    $engine.Dispose()
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
