# SoleilCode PowerShell tab completion.
# Load with: . "$PWD\completions\soleil.ps1"

$script:SoleilCommands = @(
  'doctor',
  'setup',
  'language',
  'languages',
  'run',
  'bench',
  'benchmark'
)

$script:SoleilOptions = @(
  '--cwd',
  '--mode',
  '--language',
  '--lang',
  '--yes',
  '-y',
  '--json',
  '--prompt-file',
  '--suite',
  '--runs',
  '--version',
  '-v',
  '--help',
  '-h'
)

$script:SoleilModes = @('auto', 'free', 'local', 'private')
$script:SoleilLanguages = @('en', 'tr', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko')
$script:SoleilSuites = @('smoke', 'core')

function script:New-SoleilCompletionResult {
  param(
    [string] $Value,
    [string] $ToolTip = $Value
  )

  [System.Management.Automation.CompletionResult]::new(
    $Value,
    $Value,
    [System.Management.Automation.CompletionResultType]::ParameterValue,
    $ToolTip
  )
}

Register-ArgumentCompleter -Native -CommandName soleil -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)

  $elements = @($commandAst.CommandElements | ForEach-Object { $_.ToString() })
  $previous = if ($elements.Count -ge 2) { $elements[$elements.Count - 2] } else { '' }

  $candidates = switch ($previous) {
    '--mode' { $script:SoleilModes; break }
    '--language' { $script:SoleilLanguages; break }
    '--lang' { $script:SoleilLanguages; break }
    '--suite' { $script:SoleilSuites; break }
    default {
      if ($wordToComplete -like '-*') {
        $script:SoleilOptions
      } else {
        @($script:SoleilCommands + $script:SoleilOptions)
      }
    }
  }

  $candidates |
    Where-Object { $_ -like "$wordToComplete*" } |
    Sort-Object -Unique |
    ForEach-Object { script:New-SoleilCompletionResult $_ }
}
