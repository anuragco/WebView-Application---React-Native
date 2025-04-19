import React, { useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
  ToastAndroid,
  Linking,
} from "react-native";
import WebView, { WebViewNavigation } from "react-native-webview";
import NetInfo from "@react-native-community/netinfo";
import CookieManager from '@react-native-cookies/cookies';

const App: React.FC = () => {
  const webViewRef = useRef<WebView>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  
  // State variables
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [lastBackPressTime, setLastBackPressTime] = useState<number>(0);
  const [isError, setIsError] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  
  const DOUBLE_PRESS_DELAY = 300; 
  const fixedWebUrl = "https://quotesx.online/auth/authocator/login";
  const MAIN_DOMAIN = "quotesx.online";

  // Script to intercept network and storage
  const networkInterceptor = `
    (function() {
      const origFetch = window.fetch;
      window.fetch = function(input, init) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'fetch', url: input, options: init || {} }));
        return origFetch.apply(this, arguments);
      };
      const origXhrOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'xhr', method, url }));
        return origXhrOpen.apply(this, arguments);
      };
    })();
    true;
  `;
  const storageExtractor = `
    (function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cookie', data: document.cookie }));
      const ls = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        ls[key] = localStorage.getItem(key);
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'localStorage', data: ls }));
    })();
    true;
  `;

  // Clear cookies when app starts
  useEffect(() => {
    CookieManager.clearAll(true)
      .then(() => console.log('Cookies cleared'))
      .catch(err => console.error('Error clearing cookies', err));
  }, []);

  // Network listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const isConnected = state.isConnected || false;
      if (isConnected && isOffline) {
        setIsOffline(false);
        webViewRef.current?.reload();
      } else if (!isConnected && !isOffline) {
        setIsOffline(true);
      }
    });
    NetInfo.fetch().then(state => {
      if (!state.isConnected) setIsOffline(true);
    });
    return () => unsubscribe();
  }, [isOffline]);

  // Handle back button
  useEffect(() => {
    const backAction = () => {
      const now = Date.now();
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      if (now - lastBackPressTime < DOUBLE_PRESS_DELAY) {
        Alert.alert('Exit App', 'Do you want to exit?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes', onPress: () => BackHandler.exitApp() },
        ]);
        return true;
      }
      if (Platform.OS === 'android') ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      setLastBackPressTime(now);
      return true;
    };
    const handler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => handler.remove();
  }, [canGoBack, lastBackPressTime]);

  // Domain check
  const isInAllowedDomain = (url: string) => {
    try {
      const host = new URL(url).hostname;
      return host === MAIN_DOMAIN || host.endsWith(`.${MAIN_DOMAIN}`);
    } catch {
      return false;
    }
  };

  // Open external URL
  const openInExternalBrowser = (url: string) => {
    Linking.canOpenURL(url)
      .then(supported => { if (supported) Linking.openURL(url); })
      .catch(() => Platform.OS === 'android' && ToastAndroid.show('Cannot open link', ToastAndroid.SHORT));
  };

  // Message handler
  const onMessage = (event: any) => {
    try { const msg = JSON.parse(event.nativeEvent.data); console.log('WebView message:', msg); }
    catch { console.log('Raw message:', event.nativeEvent.data); }
  };

  // Navigation state change
  const onNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    setIsLoading(navState.loading);
    setCurrentUrl(navState.url);
    if (navState.url.includes('admin/authintor/main')) {
      webViewRef.current?.injectJavaScript(networkInterceptor);
      webViewRef.current?.injectJavaScript(storageExtractor);
    }
  };

  // Should start load
  const onShouldStartLoadWithRequest = ({ url }: { url: string }) => {
    if (url === 'about:blank' || url === fixedWebUrl) return true;
    const allowed = isInAllowedDomain(url);
    if (!allowed) { openInExternalBrowser(url); return false; }
    return true;
  };

  // Error & retry
  const handleError = () => { setIsError(true); setIsLoading(false); };
  const retryLoading = () => { setIsError(false); setIsLoading(true); webViewRef.current?.reload(); };

  // Pull to refresh
  const onRefresh = () => { setIsRefreshing(true); webViewRef.current?.reload(); setTimeout(() => setIsRefreshing(false), 1500); };

  // Progress
  const onLoadProgress = ({ nativeEvent }: any) => setProgress(nativeEvent.progress);

  // Renderers
  const renderOfflineView = () => (
    <View style={styles.offlineContainer}>
      <View style={styles.offlineIconContainer}><Text style={styles.offlineIcon}>📶</Text></View>
      <Text style={styles.offlineTitle}>No Internet Connection</Text>
      <TouchableOpacity style={styles.retryButton} onPress={retryLoading}><Text style={styles.retryButtonText}>Try Again</Text></TouchableOpacity>
    </View>
  );
  const renderErrorView = () => (
    <ScrollView contentContainerStyle={styles.errorContainer} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[ '#4A90E2']} />}>        
      <Text style={styles.errorTitle}>We're Currently Under Maintenance</Text>
      <Text style={styles.maintenanceEmoji}>🛠️</Text>
      <Text style={styles.errorMessage}>Our team is working hard to improve the site...</Text>
      <TouchableOpacity style={styles.retryButton} onPress={retryLoading}><Text style={styles.retryButtonText}>Try Again</Text></TouchableOpacity>
      <Text style={styles.pullToRefreshHint}>Pull down to refresh</Text>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      {isOffline ? renderOfflineView() : isError ? renderErrorView() : (
        <View style={styles.webContainer}>
          {isLoading && <View style={styles.progressBarContainer}><View style={[styles.progressBar, { width: `${progress*100}%`}]} /></View>}
          <WebView
            ref={webViewRef}
            source={{ uri: fixedWebUrl }}
            onNavigationStateChange={onNavigationStateChange}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onMessage={onMessage}
            onError={handleError}
            onLoadProgress={onLoadProgress}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            pullToRefreshEnabled
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            originWhitelist={['*']}
            userAgent="Mozilla/5.0 (Linux; Android...) QuotesXApp/1.0"
            injectedJavaScript={networkInterceptor + storageExtractor}
            renderLoading={() => (
              <View style={styles.loaderContainer}><ActivityIndicator size="large" color="#4A90E2"/></View>
            )}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  webContainer: { flex: 1, position: 'relative' },
  progressBarContainer: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#E0E0E0', zIndex: 10 },
  progressBar: { height: '100%', backgroundColor: '#4A90E2' },
  loaderContainer: { flex:1, justifyContent:'center', alignItems:'center', backgroundColor:'#FFF' },
  offlineContainer:{flex:1,justifyContent:'center',alignItems:'center',padding:20,backgroundColor:'#F5F5F5'},
  offlineIconContainer:{width:80,height:80,borderRadius:40,backgroundColor:'#E0E0E0',justifyContent:'center',alignItems:'center',marginBottom:20},
  offlineIcon:{fontSize:40},
  offlineTitle:{fontSize:22,fontWeight:'bold',marginBottom:10,color:'#333'},
  retryButton:{backgroundColor:'#4A90E2',paddingHorizontal:30,paddingVertical:12,borderRadius:25},
  retryButtonText:{color:'#fff',fontSize:16,fontWeight:'bold'},
  errorContainer:{flex:1,justifyContent:'center',alignItems:'center',padding:20,backgroundColor:'#F5F5F5'},
  errorTitle:{fontSize:22,fontWeight:'bold',marginBottom:10,color:'#333'},
  maintenanceEmoji:{fontSize:70,marginVertical:20},
  errorMessage:{fontSize:16,textAlign:'center',marginBottom:20,color:'#666',lineHeight:24},
  pullToRefreshHint:{marginTop:20,color:'#999',fontSize:14},
});

export default App;
