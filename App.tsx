import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Platform, StatusBar as NativeStatusBar, StyleSheet, View } from 'react-native';
import { AppProvider, useApp } from './src/AppContext';
import { AppShell } from './src/screens';

export default function App() {
  return (
    <AppProvider>
      <AppRoot />
    </AppProvider>
  );
}

function AppRoot() {
  const { theme } = useApp();
  return (
    <View style={[styles.root, {
      backgroundColor: theme === 'dark' ? '#1C0F18' : '#FFF5F2',
      paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0,
    }]}>
      <AppShell />
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
