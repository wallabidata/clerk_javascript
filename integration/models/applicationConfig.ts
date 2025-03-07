import * as path from 'node:path';

import { constants } from '../constants';
import { createLogger, fs } from '../scripts';
import { application } from './application';
import type { EnvironmentConfig } from './environment';
import type { Helpers } from './helpers';
import { hash, helpers } from './helpers';

export type ApplicationConfig = ReturnType<typeof applicationConfig>;
type Scripts = { dev: string; build: string; setup: string; serve: string };

export const applicationConfig = () => {
  let name = '';
  let serverUrl = '';
  const templates: string[] = [];
  const files = new Map<string, string>();
  const scripts: Scripts = { dev: 'pnpm dev', serve: 'pnpm serve', build: 'pnpm build', setup: 'pnpm install' };
  const envFormatters = { public: (key: string) => key, private: (key: string) => key };
  const logger = createLogger({ prefix: 'appConfig', color: 'yellow' });
  const dependencies = new Map<string, string>();

  const self = {
    clone: () => {
      const clone = applicationConfig();
      clone.setName(name);
      clone.setEnvFormatter('public', envFormatters.public);
      clone.setEnvFormatter('private', envFormatters.private);
      templates.forEach(t => clone.useTemplate(t));
      dependencies.forEach((v, k) => clone.addDependency(k, v));
      Object.entries(scripts).forEach(([k, v]) => clone.addScript(k as keyof typeof scripts, v));
      files.forEach((v, k) => clone.addFile(k, () => v));
      return clone;
    },
    setName: (_name: string) => {
      name = _name;
      return self;
    },
    setServerUrl: (_serverUrl: string) => {
      serverUrl = _serverUrl;
      return self;
    },
    addFile: (filePath: string, cbOrPath: (helpers: Helpers) => string) => {
      files.set(filePath, cbOrPath(helpers));
      return self;
    },
    useTemplate: (path: string) => {
      templates.push(path);
      return self;
    },
    setEnvFormatter: (type: keyof typeof envFormatters, formatter: typeof envFormatters.public) => {
      envFormatters[type] = formatter;
      return self;
    },
    addScript: (name: keyof typeof scripts, cmd: string) => {
      if (!Object.keys(scripts).includes(name)) {
        throw new Error(`Invalid script name: ${name}, must be one of ${Object.keys(scripts).join(', ')}`);
      }
      scripts[name] = cmd;
      return self;
    },
    /**
     * Adds a dependency to the template's `package.json` file. If the version is undefined, the dependency is not added. If the dependency already exists, the version is overwritten.
     */
    addDependency: (name: string, version: string | undefined) => {
      if (version) {
        dependencies.set(name, version);
      }
      return self;
    },
    commit: async (opts?: { stableHash?: string }) => {
      const { stableHash } = opts || {};
      logger.info(`Creating project "${name}"`);

      const appDirName = stableHash || `${name}__${Date.now()}__${hash()}`;
      const appDirPath = path.resolve(constants.TMP_DIR, appDirName);

      // Copy template files
      for (const template of templates) {
        logger.info(`Copying template "${path.basename(template)}" -> ${appDirPath}`);
        await fs.ensureDir(appDirPath);
        await fs.copy(template, appDirPath, { overwrite: true, filter: (p: string) => !p.includes('node_modules') });
      }

      // Create individual files
      await Promise.all(
        [...files].map(async ([pathname, contents]) => {
          const dest = path.resolve(appDirPath, pathname);
          logger.info(`Copying file "${pathname}" -> ${dest}`);
          await fs.ensureFile(dest);
          await fs.writeFile(dest, contents);
        }),
      );

      // Adjust package.json dependencies
      if (dependencies.size > 0) {
        const packageJsonPath = path.resolve(appDirPath, 'package.json');
        logger.info(`Modifying dependencies in "${packageJsonPath}"`);
        const contents = await fs.readJSON(packageJsonPath);
        contents.dependencies = { ...contents.dependencies, ...Object.fromEntries(dependencies) };
        await fs.writeJSON(packageJsonPath, contents, { spaces: 2 });
      }

      return application(self, appDirPath, appDirName, serverUrl);
    },
    setEnvWriter: () => {
      throw new Error('not implemented');
    },
    get name() {
      return name;
    },
    get scripts() {
      return scripts;
    },
    get envWriter() {
      const defaultWriter = async (appDir: string, env: EnvironmentConfig) => {
        // Create env files
        const envDest = path.join(appDir, '.env');
        await fs.ensureFile(envDest);
        logger.info(`Creating env file ".env" -> ${envDest}`);
        await fs.writeFile(
          path.join(appDir, '.env'),
          [...env.publicVariables]
            .filter(([_, v]) => v)
            .map(([k, v]) => `${envFormatters.public(k)}=${v}`)
            .join('\n') +
            '\n' +
            [...env.privateVariables]
              .filter(([_, v]) => v)
              .map(([k, v]) => `${envFormatters.private(k)}=${v}`)
              .join('\n'),
        );
      };
      return defaultWriter;
    },
  };

  return self;
};
