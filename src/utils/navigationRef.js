import {createNavigationContainerRef} from '@react-navigation/native';

// Lets non-screen code (e.g. the plan-limit alert) navigate.
export const navigationRef = createNavigationContainerRef();

export const navigateTo = (name, params) => {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
    return true;
  }
  return false;
};
