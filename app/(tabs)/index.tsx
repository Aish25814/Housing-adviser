import React from 'react';
import { Platform, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';

const WEBVIEW_URI = Platform.OS === 'android'
  ? 'http://10.0.2.2:5173'
  : 'http://192.168.137.1:5173';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <WebView source={{ uri: WEBVIEW_URI }} />
    </SafeAreaView>
  );
}