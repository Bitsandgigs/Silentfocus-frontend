// import baseLocal from 'react-native-i18n';

// import en from './en';

// baseLocal.fallbacks = true;

// baseLocal.translations = {
//     en,
// };

// export default baseLocal;


import {I18n} from 'i18n-js';
import en from './en';

const i18n = new I18n();

i18n.translations = {
  en,
};

i18n.locale = 'en';
i18n.enableFallback = true;

export default i18n;