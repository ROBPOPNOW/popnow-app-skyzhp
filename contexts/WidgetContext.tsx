import * as React from "react";
import { createContext, useCallback, useContext } from "react";
import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";

// Initialize storage with your group ID
const storage = new ExtensionStorage(
  "group.com.<user_name>.<app_name>"
);

type WidgetContextType = {
  refreshWidget: () => void;
};

const WidgetContext = createContext<WidgetContextType | null>(null);

export function WidgetProvider({ children }: { children: React.ReactNode }) {
  // Update widget state whenever what we want to show changes
  React.useEffect(() => {
    try {
      if (
        Platform.OS === 'ios' &&
        ExtensionStorage &&
        typeof ExtensionStorage.reloadWidget === 'function'
      ) {
        ExtensionStorage.reloadWidget();
      }
    } catch (e) {
      // Widget extension not available on this platform
    }
  }, []);

  const refreshWidget = useCallback(() => {
    try {
      if (
        Platform.OS === 'ios' &&
        ExtensionStorage &&
        typeof ExtensionStorage.reloadWidget === 'function'
      ) {
        ExtensionStorage.reloadWidget();
      }
    } catch (e) {
      // Widget extension not available on this platform
    }
  }, []);

  return (
    <WidgetContext.Provider value={{ refreshWidget }}>
      {children}
    </WidgetContext.Provider>
  );
}

export const useWidget = () => {
  const context = useContext(WidgetContext);
  if (!context) {
    throw new Error("useWidget must be used within a WidgetProvider");
  }
  return context;
};