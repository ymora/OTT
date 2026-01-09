import json
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'jest-output.json'
if not path.exists():
    raise SystemExit('jest-output.json missing')

data = json.loads(path.read_text('utf-8'))
print('failed tests:', data.get('numFailedTests'), 'failed suites:', data.get('numFailedTestSuites'))
print('--- suites summary ---')
for suite in data.get('testResults', []):
    if suite.get('status') != 'passed':
        print('\nSuite:', suite.get('name'))
        print(' status:', suite.get('status'))
        for assertion in suite.get('assertionResults', []):
            if assertion.get('status') != 'passed':
                title = assertion.get('title', '<no title>')
                print('  - Test:', title)
                for msg in assertion.get('failureMessages', []):
                    print('    *', msg.split('\n', 1)[0])
                    print('      ', msg.replace('\n', '\n      '))
