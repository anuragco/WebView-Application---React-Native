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
} from "react-native";
import WebView, { WebViewNavigation } from "react-native-webview";
import NetInfo from "@react-native-community/netinfo";

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
  
  const DOUBLE_PRESS_DELAY = 300; // Time in milliseconds
  const fixedWebUrl = "https://color31.in";
  
  // Set up network listener
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

    // Initial network check
    NetInfo.fetch().then(state => {
      if (!(state.isConnected || false)) {
        setIsOffline(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOffline]);

  // Handle back button
  useEffect(() => {
    const backAction = () => {
      const currentTime = new Date().getTime();
      
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      
      if (currentTime - lastBackPressTime < DOUBLE_PRESS_DELAY) {
        Alert.alert(
          "Exit App", 
          "Do you want to exit?", 
          [
            { 
              text: "Cancel", 
              style: "cancel" 
            },
            { 
              text: "Yes", 
              onPress: () => BackHandler.exitApp() 
            }
          ],
          { cancelable: true }
        );
        return true;
      }
      
      if (Platform.OS === 'android') {
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      }
      
      setLastBackPressTime(currentTime);
      return true;
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, [canGoBack, lastBackPressTime]);

  // Navigation state change handler
  const onNavigationStateChange = (navState: WebViewNavigation) => {
    setCanGoBack(navState.canGoBack);
    setIsLoading(navState.loading);
    
    // Ensure user stays within the fixed URL domain
    const isInAllowedDomain = navState.url.startsWith(fixedWebUrl);
    
    if (!isInAllowedDomain && webViewRef.current) {
      webViewRef.current.stopLoading();
      webViewRef.current.goBack();
      
      if (Platform.OS === 'android') {
        ToastAndroid.show('Navigation outside the app is restricted', ToastAndroid.SHORT);
      }
    }
  };

  // Error handler
  const handleError = () => {
    setIsError(true);
    setIsLoading(false);
  };

  // Retry loading
  const retryLoading = () => {
    setIsError(false);
    setIsLoading(true);
    webViewRef.current?.reload();
  };

  // Handle pull-to-refresh
  const onRefresh = () => {
    setIsRefreshing(true);
    webViewRef.current?.reload();
    
    // Reset refreshing state after a delay
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1500);
  };

  // Load progress handler
  const onLoadProgress = ({ nativeEvent }: { nativeEvent: { progress: number } }) => {
    setProgress(nativeEvent.progress);
  };

  // Render offline view
  const renderOfflineView = () => {
    return (
      <View style={styles.offlineContainer}>
        <View style={styles.offlineIconContainer}>
          <Text style={styles.offlineIcon}>📶</Text>
        </View>
        <Text style={styles.offlineTitle}>No Internet Connection</Text>
        <Text style={styles.offlineMessage}>
          Please check your connection and try again.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={retryLoading}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Render error view
  const renderErrorView = () => {
    return (
      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.errorContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={['#4A90E2']}
            tintColor="#4A90E2"
          />
        }
      >
        <Text style={styles.errorTitle}>We're Currently Under Maintenance</Text>
        <Text style={styles.maintenanceEmoji}>🛠️</Text>
        <Text style={styles.errorMessage}>
          Our team is working hard to improve the site and get it back online.
          We'll be back shortly with even better features!
        </Text>
        <Text style={styles.maintenanceTime}>
          Estimated downtime: A few hours
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={retryLoading}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
        <Text style={styles.pullToRefreshHint}>
          Pull down to refresh
        </Text>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {isOffline ? (
        renderOfflineView()
      ) : isError ? (
        renderErrorView()
      ) : (
        <View style={styles.webContainer}>
          {/* Progress bar */}
          {isLoading && (
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
            </View>
          )}
          
          {/* WebView with pull-to-refresh */}
          <WebView
            ref={webViewRef}
            source={{ uri: fixedWebUrl }}
            onNavigationStateChange={onNavigationStateChange}
            onError={handleError}
            onLoadProgress={onLoadProgress}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#4A90E2" />
              </View>
            )}
            pullToRefreshEnabled
            onLoadEnd={() => setIsLoading(false)}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: '#fff'
  },
  webContainer: {
    flex: 1,
    position: 'relative'
  },
  webview: { 
    flex: 1 
  },
  progressBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#E0E0E0',
    zIndex: 10
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4A90E2'
  },
  loaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF'
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#F5F5F5",
    minHeight: 500
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
    color: "#333"
  },
  maintenanceEmoji: {
    fontSize: 70,
    marginVertical: 20
  },
  errorMessage: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    color: "#666",
    lineHeight: 24
  },
  maintenanceTime: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 30,
    color: "#4A90E2"
  },
  retryButton: {
    backgroundColor: "#4A90E2",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  retryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  pullToRefreshHint: {
    marginTop: 20,
    color: "#999",
    fontSize: 14
  },
  offlineContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#F5F5F5"
  },
  offlineIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#E0E0E0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20
  },
  offlineIcon: {
    fontSize: 40
  },
  offlineTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
    color: "#333"
  },
  offlineMessage: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 30,
    color: "#666"
  }
});

export default App;