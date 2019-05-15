'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const helpers = require('../helpers');
const runMochaJSONRawAsync = helpers.runMochaJSONRawAsync;

const sigintExitCode = 130;

describe('--watch', function() {
  describe('when enabled', function() {
    this.timeout(10 * 1000);
    this.slow(3000);

    before(function() {
      // Feature works but SIMULATING the signal (ctrl+c) via child process
      // does not work due to lack of POSIX signal compliance on Windows.
      if (process.platform === 'win32') {
        this.skip();
      }
    });

    beforeEach(function() {
      this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocha-'));

      var fixtureSource = helpers.resolveFixturePath(helpers.DEFAULT_FIXTURE);

      this.testFile = path.join(this.tempDir, 'test.js');
      fs.copySync(fixtureSource, this.testFile);
    });

    afterEach(function() {
      if (this.tempDir) {
        return fs.remove(this.tempDir);
      }
    });

    it('should show the cursor and signal correct exit code, when watch process is terminated', function() {
      const [mocha, resultPromise] = runMochaJSONRawAsync(
        helpers.DEFAULT_FIXTURE,
        ['--watch']
      );

      return sleep(1000)
        .then(() => {
          mocha.kill('SIGINT');
          return resultPromise;
        })
        .then(data => {
          const expectedCloseCursor = '\u001b[?25h';
          expect(data.output, 'to contain', expectedCloseCursor);

          expect(data.code, 'to be', sigintExitCode);
        });
    });

    it('reruns test when watched test file is touched', function() {
      const [mocha, outputPromise] = runMochaJSONWatchAsync(this.testFile, [], {
        cwd: this.tempDir
      });

      return sleep(1000)
        .then(() => {
          touchFile(this.testFile);
          return sleep(1000);
        })
        .then(() => {
          mocha.kill('SIGINT');
          return outputPromise;
        })
        .then(results => {
          expect(results, 'to have length', 2);
        });
    });

    it('reruns test when file matching extension is touched', function() {
      const watchedFile = path.join(this.tempDir, 'file.xyz');
      touchFile(watchedFile);
      const [mocha, outputPromise] = runMochaJSONWatchAsync(
        this.testFile,
        ['--extension', 'xyz,js'],
        {
          cwd: this.tempDir
        }
      );

      return sleep(1000)
        .then(() => {
          touchFile(watchedFile);
          return sleep(1000);
        })
        .then(() => {
          mocha.kill('SIGINT');
          return outputPromise;
        })
        .then(results => {
          expect(results, 'to have length', 2);
        });
    });

    it('ignores files in "node_modules" and ".git"', function() {
      const nodeModulesFile = path.join(
        this.tempDir,
        'node_modules',
        'file.xyz'
      );
      const gitFile = path.join(this.tempDir, '.git', 'file.xyz');

      touchFile(gitFile);
      touchFile(nodeModulesFile);

      const [mocha, outputPromise] = runMochaJSONWatchAsync(
        this.testFile,
        ['--extension', 'xyz,js'],
        {
          cwd: this.tempDir
        }
      );

      return sleep(1000)
        .then(() => {
          touchFile(gitFile);
          touchFile(nodeModulesFile);
        })
        .then(() => sleep(1000))
        .then(() => {
          mocha.kill('SIGINT');
          return outputPromise;
        })
        .then(results => {
          expect(results, 'to have length', 1);
        });
    });
  });
});

/**
 * Invokes the mocha binary with the `--watch` argument for the given fixture.
 *
 * Returns child process and a promise for the test results. The test results
 * are an array of JSON objects generated by the JSON reporter.
 *
 * Checks that the exit code of the mocha command is 130, i.e. mocha was killed
 * by SIGINT.
 */
function runMochaJSONWatchAsync(fixture, args, spawnOpts) {
  args = ['--watch'].concat(args);
  const [mocha, mochaDone] = runMochaJSONRawAsync(fixture, args, spawnOpts);
  const testResults = mochaDone.then(data => {
    expect(data.code, 'to be', sigintExitCode);

    const testResults = data.output
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[\?25./g, '')
      .split('\u001b[2K')
      .map(x => JSON.parse(x));
    return testResults;
  });
  return [mocha, testResults];
}

/**
 * Touch a file by appending a space to the end. Returns a promise that resolves
 * when the file has been touched.
 */
function touchFile(file) {
  fs.ensureDirSync(path.dirname(file));
  fs.appendFileSync(file, ' ');
}

function sleep(time) {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}
