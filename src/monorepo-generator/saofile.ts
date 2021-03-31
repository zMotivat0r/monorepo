import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as color from 'chalk';
import * as emoji from 'node-emoji';
import { getParentProcessPassedOptions } from '../helpers';
import { logger } from '../utils';
import { IMonorepoGeneratorAnswers, IParentCommandPassedOptions } from './interfaces';

enum LERNA_PACKAGES_VERSIONING {
  independent = 'independent',
  common = 'common',
}

enum PACKAGE_REGISTRY {
  github = 'github',
  npm = 'npm',
}

const LERNA_PACKAGES_VERSIONING_CHOICES = [
  {
    name: LERNA_PACKAGES_VERSIONING.common,
    checked: true,
  },
  {
    name: LERNA_PACKAGES_VERSIONING.independent,
  },
];

const PACKAGE_REGISTRY_CHOICES = [
  {
    name: PACKAGE_REGISTRY.github,
    checked: true,
  },
  {
    name: PACKAGE_REGISTRY.npm,
  },
];

// helpers
const cwd = process.cwd();
const parentOptions = getParentProcessPassedOptions<IParentCommandPassedOptions>(process);
const monorepoPath = join(cwd, `./${parentOptions.name}`);
const templateDir = join(__dirname, '../templates/monorepo-generator');

// default answers
const defaultAnswers: IMonorepoGeneratorAnswers = {
  monorepoName: parentOptions.name,
  workspaceName: 'packages',
  scope: '',
  pgDefaultsAccess: 'restricted',
  pgDefaultsLicense: 'MIT',
  pgDefaultsAuthorName: '',
  pgDefaultsAuthorEmail: '',
  lernaPackageVersioning: LERNA_PACKAGES_VERSIONING.independent,
  publishPackageCommitMsg: 'chore: publish package',
  currentYear: new Date().getFullYear(),
  packageRegistry: PACKAGE_REGISTRY.github,
  shouldGeneratePackage: false,
  firstPackageName: '',
};

// check folder exists
const folderExists = existsSync(monorepoPath);

if (folderExists) {
  const msg = `${emoji.get(':flushed:')} Folder ${color.bold.magentaBright(parentOptions.name)} already exists`;
  logger.error('cli', msg);
  throw new Error(msg);
}

const result = {
  prompts() {
    const prompts = [];

    prompts.push({
      name: 'scope',
      message: 'Packages scope:',
      default: defaultAnswers.monorepoName,
      validate: validateNotEmpty,
    });

    if (parentOptions.useDefaults) {
      return prompts;
    }

    prompts.push({
      name: 'workspaceName',
      message: 'Packages folder:',
      default: defaultAnswers.workspaceName,
      validate: validateNotEmpty,
    });

    prompts.push({
      name: 'pgDefaultsAccess',
      message: 'Packages access:',
      default: defaultAnswers.pgDefaultsAccess,
      validate: validateNotEmpty,
    });

    prompts.push({
      name: 'pgDefaultsLicense',
      message: 'Packages license:',
      default: defaultAnswers.pgDefaultsLicense,
      validate: validateNotEmpty,
    });

    prompts.push({
      name: 'pgDefaultsAuthorName',
      message: 'Author`s name:',
      validate: validateNotEmpty,
    });

    prompts.push({
      name: 'pgDefaultsAuthorEmail',
      message: 'Author`s email:',
      validate: validateNotEmpty,
    });

    prompts.push({
      name: 'publishPackageCommitMsg',
      message: 'Commit message when package publishing:',
      default: defaultAnswers.publishPackageCommitMsg,
      validate: validateNotEmpty,
    });

    prompts.push({
      name: 'lernaPackageVersioning',
      type: 'list',
      message: 'Choose lerna packages versioning:',
      choices: LERNA_PACKAGES_VERSIONING_CHOICES,
    });

    prompts.push({
      name: 'packageRegistry',
      type: 'list',
      message: 'Choose packages registry:',
      choices: PACKAGE_REGISTRY_CHOICES,
    });

    if (!parentOptions.dryRun) {
      prompts.push({
        name: 'shouldGeneratePackage',
        message: 'Generate first package?',
        type: 'confirm',
        default: defaultAnswers.shouldGeneratePackage,
      });

      prompts.push({
        name: 'firstPackageName',
        message: 'First package name:',
        validate: validateNotEmpty,
        when: (answers) => answers.shouldGeneratePackage,
      });
    }

    return prompts;
  },
  actions() {
    this.answers.monorepoName = defaultAnswers.monorepoName;
    this.answers.currentYear = defaultAnswers.currentYear;
    this.sao.opts.outDir = monorepoPath;

    if (parentOptions.useDefaults) {
      this.answers.workspaceName = defaultAnswers.workspaceName;
      this.answers.pgDefaultsAccess = defaultAnswers.pgDefaultsAccess;
      this.answers.pgDefaultsLicense = defaultAnswers.pgDefaultsLicense;
      this.answers.pgDefaultsAuthorName = defaultAnswers.pgDefaultsAuthorName;
      this.answers.pgDefaultsAuthorEmail = defaultAnswers.pgDefaultsAuthorEmail;
      this.answers.publishPackageCommitMsg = defaultAnswers.publishPackageCommitMsg;
      this.answers.lernaPackageVersioning = defaultAnswers.lernaPackageVersioning;
      this.answers.packageRegistry = defaultAnswers.packageRegistry;
      this.answers.shouldGeneratePackage = defaultAnswers.shouldGeneratePackage;
    }

    this.answers.lernaPackageVersioning =
      this.answers.lernaPackageVersioning === LERNA_PACKAGES_VERSIONING.independent
        ? LERNA_PACKAGES_VERSIONING.independent
        : '0.0.0';

    if (parentOptions.dryRun) {
      return [];
    }

    mkdirSync(monorepoPath, '0744');

    return [
      {
        type: 'add',
        files: '**',
        filters: {
          npmrc: `packageRegistry === '${PACKAGE_REGISTRY.github}'`,
        },
        templateDir,
      },
      {
        type: 'move',
        patterns: {
          packagesGitKeep: `${this.answers.workspaceName}/.gitkeep`,
          e2eGitKeep: 'e2e/.gitkeep',
          gitignore: '.gitignore',
          prettierrc: '.prettierrc',
          yarnrc: '.yarnrc',
          eslintignore: '.eslintignore',
          npmrc: '.npmrc',
          'pre-commit': '.husky/pre-commit',
          'eslintrc.js': '.eslintrc.js',
        },
      },
    ];
  },
  completed() {
    if (!parentOptions.dryRun) {
      if (!parentOptions.skipScripts) {
        if (!parentOptions.skipInstall) {
          logger.info('cli', 'installing dependencies');
          // installing dependencies
          execSync(`cd ${monorepoPath} && npm i lerna@3.22.1 && npm run boot && npx rimraf ./package-lock.json`, {
            stdio: 'inherit',
          });
          // set husky executable
          execSync(`cd ${monorepoPath} && chmod +x .husky/pre-commit`);
        }

        if (!parentOptions.skipGit) {
          // git init
          logger.info('cli', 'git init');
          execSync(`cd ${monorepoPath} && git init && git checkout -b main`);

          if (!parentOptions.skipGitCommit) {
            // initial commit
            execSync(`cd ${monorepoPath} && git add . && git commit -m "chore: initial commit" --no-verify`);
          }
        }
      }

      if (this.answers.firstPackageName) {
        // generate first package
        execSync(`cd ${monorepoPath} && mrepo g ${this.answers.firstPackageName} -y`, {
          stdio: 'inherit',
        });
      }
    }
  },
};

function validateNotEmpty(v: string): boolean {
  return !!v;
}

module.exports = result;