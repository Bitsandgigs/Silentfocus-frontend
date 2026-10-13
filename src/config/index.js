// Resolves the API config for the environment selected in ./env.js.
// Metro can't do dynamic requires, so every variant is imported statically.
import developmentConfig from './index.development';
import stagingConfig from './index.staging';
import productionConfig from './index.production';
import {APP_ENV} from './env';

export const configs = {
  development: developmentConfig,
  staging: stagingConfig,
  production: productionConfig,
};

export const resolveConfig = env => configs[env] || configs.development;

export default resolveConfig(APP_ENV);
