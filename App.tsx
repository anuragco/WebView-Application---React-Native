import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Alert, StatusBar, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, RefreshControl, ScrollView, Platform, ToastAndroid, Linking, Dimensions } from 'react-native';
import WebView, { WebViewNavigation } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';
import CookieManager from '@react-native-cookies/cookies';
import AppUpdateChecker from './android/app/src/Components/AppUpdateChecker'; // Adjusted path to match folder naming convention

interface AppConfig {
    main_domain: string;
    allowed_domains: string[];
    payment_domains: string[];
}

const App: React.FC = () => {
    const webViewRef = useRef<WebView>(null);
    const [canGoBack, setCanGoBack] = useState<boolean>(false);
    const [lastBackPressTime, setLastBackPressTime] = useState<number>(0);
    const [isError, setIsError] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isOffline, setIsOffline] = useState<boolean>(false);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [progress, setProgress] = useState<number>(0);
    const [currentUrl, setCurrentUrl] = useState<string>('');
    const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
    const [configLoading, setConfigLoading] = useState<boolean>(true);
    const [configError, setConfigError] = useState<boolean>(false);
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
    interface DebugData {
        lastLoginRequest?: {
            url: string;
            method: string;
            time: string;
        };
        lastLoginResponse?: {
            url: string;
            status: number;
            data: any;
            time: string;
        };
        localStorageKeys?: string[];
        sessionStorageKeys?: string[];
        lastStorageUpdate?: string;
        lastLoginForm?: {
            action: string;
            time: string;
        };
    }

    const [debugData, setDebugData] = useState<DebugData>({});

    const monitoringScript = `(function() { window.isLoggedIn = false; const origFetch = window.fetch; window.fetch = function(input, init) { const url = typeof input === 'string' ? input : input.url; if (typeof url === 'string' && !url.includes('analytics')) { const method = init?.method || 'GET'; if (url.includes('login') || url.includes('auth') || url.includes('sign-in')) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'login-request', method: method, url: url })); } else { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'network', method: method, url: url })); } } const promise = origFetch.apply(this, arguments); if (typeof url === 'string' && (url.includes('login') || url.includes('auth') || url.includes('sign-in'))) { promise.then(response => { const responseClone = response.clone(); responseClone.json().then(data => { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'login-response', status: response.status, url: url, data: data })); if (response.status >= 200 && response.status < 300 && (data.token || data.auth || data.user || data.success)) { windowisLoggedIn = true; captureStorageAfterLogin(); } }).catch(err => { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'login-response-error', status: response.status, url: url, error: 'Cannot parse response as JSON' })); }); }); } return promise; }; function captureStorage() { try { const sessionData = {}; const localData = {}; if (window.sessionStorage) { for (let i = 0; i < sessionStorage.length; i++) { const key = sessionStorage.key(i); if (key) sessionData[key] = sessionStorage.getItem(key); } } if (window.localStorage) { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key) localData[key] = localStorage.getItem(key); } } window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'storage', sessionData: sessionData, localData: localData, isLoggedIn: window.isLoggedIn })); } catch (e) { console.error('Storage monitoring error:', e); window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: 'Storage monitoring error: ' + e.message })); } } function captureStorageAfterLogin() { setTimeout(captureStorage, 500); setTimeout(captureStorage, 2000); } setInterval(captureStorage, 5000); document.addEventListener('submit', function(e) { if (e.target && e.target.tagName === 'FORM') { const formData = new FormData(e.target); const hasLoginFields = formData.has('email') || formData.has('username') || formData.has('password') || e.target.id.includes('login') || e.target.action.includes('login'); window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'form', action: e.target.action || 'unknown', isLoginForm: hasLoginFields })); if (hasLoginFields) setTimeout(captureStorageAfterLogin, 1500); } }); const observeLoginElements = () => { const observer = new MutationObserver((mutations) => { const loggedInIndicators = document.querySelectorAll('.logged-in, .user-avatar, .user-menu, .profile-link, .account-menu, .logout-button'); if (loggedInIndicators.length > 0 && !windowisLoggedIn) { windowisLoggedIn = true; window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'login-detected', method: 'dom-observation' })); captureStorageAfterLogin(); } }); observer.observe(document.body, { childList: true, subtree: true, attributes: true }); }; if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', observeLoginElements); } else { observeLoginElements(); } captureStorage(); })();`;

    useEffect(() => {
        fetchAppConfig();
    }, []);

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            const isConnected = state.isConnected || false;
            if (isConnected && isOffline) {
                setIsOffline(false);
                if (!configLoading && !configError) webViewRef.current?.reload();
                else fetchAppConfig();
            } else if (!isConnected && !isOffline) {
                setIsOffline(true);
            }
        });
        NetInfo.fetch().then(state => {
            if (!state.isConnected) setIsOffline(true);
        });
        return () => unsubscribe();
    }, [isOffline, configLoading, configError]);

    useEffect(() => {
        const backAction = () => {
            const now = Date.now();
            if (canGoBack && webViewRef.current) {
                webViewRef.current.goBack();
                return true;
            }
            if (now - lastBackPressTime < 300) {
                Alert.alert('Exit App', 'Do you want to exit?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', onPress: () => BackHandler.exitApp() }], { cancelable: true });
                return true;
            }
            if (Platform.OS === 'android') ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
            setLastBackPressTime(now);
            return true;
        };
        const handler = BackHandler.addEventListener('hardwareBackPress', backAction);
        return () => handler.remove();
    }, [canGoBack, lastBackPressTime]);

    const noZoomScript = `
  if (document.querySelector('meta[name="viewport"]')) {
    document.querySelector('meta[name="viewport"]').setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
  } else {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    document.head.appendChild(meta);
  }
`;

    const fetchAppConfig = async () => {
        setConfigLoading(true);
        setConfigError(false);
        try {
            const response = await fetch('https://api.quotesx.online/api/app-config', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-API-Key': 'QX-API-42f9e94d3c2be1b3',
                    'X-App-Version': '1.2.0',
                    'X-Device-Type': Platform.OS
                }
            });
            if (!response.ok) throw new Error('Failed to fetch configuration');
            const { error, data } = await response.json();
            if (error) throw new Error('API returned error');
            setAppConfig(data);
            setConfigLoading(false);
        } catch (error) {
            console.error('Error fetching app config:', error);
            setConfigError(true);
            setConfigLoading(false);
        }
    };

    const isInAllowedDomain = (url: string) => {
        if (!appConfig) return false;
        try {
            const urlObj = new URL(url);
            const host = urlObj.hostname;
            return appConfig.allowed_domains.some(domain => host === domain || host.endsWith(`.${domain}`));
        } catch {
            return false;
        }
    };

    const isPaymentDomain = (url: string) => {
        if (!appConfig) return false;
        try {
            const urlObj = new URL(url);
            const host = urlObj.hostname;
            return appConfig.payment_domains.some(domain => host === domain || host.endsWith(`.${domain}`));
        } catch {
            return false;
        }
    };

    const openInExternalBrowser = (url: string) => {
        Linking.canOpenURL(url).then(supported => {
            if (supported) Linking.openURL(url);
        }).catch(() => Platform.OS === 'android' && ToastAndroid.show('Cannot open link', ToastAndroid.SHORT));
    };

    const onMessage = (event: any) => {
        try {
            const msg = JSON.parse(event.nativeEvent.data);
            switch (msg.type) {
                case 'network':
                    console.log('Network activity:', msg.method, msg.url);
                    break;
                case 'login-request':
                    console.log('Login request detected:', msg.method, msg.url);
                    setDebugData(prev => ({ 
                        ...prev, 
                        lastLoginRequest: { 
                            url: msg.url, 
                            method: msg.method, 
                            time: new Date().toISOString() 
                        } 
                    }));
                    break;
                case 'login-response':
                    console.log('Login response:', msg.status, msg.url);
                    if (msg.status >= 200 && msg.status < 300 && (msg.data.token || msg.data.auth || msg.data.user || msg.data.success)) {
                        setIsLoggedIn(true);
                        console.log('Login successful!');
                    }
                    setDebugData((prev: DebugData) => ({
                        ...prev,
                        lastLoginResponse: {
                            url: msg.url,
                            status: msg.status,
                            data: msg.data,
                            time: new Date().toISOString()
                        }
                    }));
                    break;
                case 'login-detected':
                    console.log('Login detected via', msg.method);
                    setIsLoggedIn(true);
                    break;
                case 'storage':
                    console.log('Storage update, logged in:', msg.isLoggedIn);
                    if (msg.isLoggedIn && !isLoggedIn) setIsLoggedIn(true);
                    setDebugData((prev: DebugData) => ({
                        ...prev,
                        localStorageKeys: Object.keys(msg.localData),
                        sessionStorageKeys: Object.keys(msg.sessionData),
                        lastStorageUpdate: new Date().toISOString()
                    }));
                    break;
                case 'form':
                    console.log('Form submission:', msg.action, msg.isLoginForm ? '(login form)' : '');
                    if (msg.isLoginForm) {
                        setDebugData((prev: DebugData) => ({
                            ...prev,
                            lastLoginForm: { action: msg.action, time: new Date().toISOString() }
                        }));
                    }
                    break;
                case 'error':
                    console.error('WebView error:', msg.message);
                    break;
                default:
                    console.log('WebView message:', msg);
            }
        } catch (error) {
            console.log('Raw message:', event.nativeEvent.data);
        }
    };

    const onNavigationStateChange = (navState: WebViewNavigation) => {
        console.log('Navigation state change:', navState.url);
        setCanGoBack(navState.canGoBack);
        setIsLoading(navState.loading);
        setCurrentUrl(navState.url);
        if (!navState.loading && webViewRef.current) {
            webViewRef.current.injectJavaScript(monitoringScript);
            webViewRef.current.injectJavaScript(noZoomScript);
        }
    };

    const onShouldStartLoadWithRequest = (request: any) => {
        const { url } = request;
        if (url === 'about:blank') return true;
        try {
            const urlObj = new URL(url);
            const host = urlObj.hostname;

            const mainDomainMatches = appConfig?.allowed_domains.some(domain =>
                host === domain || host.endsWith(`.${domain}`)
            );

            if (mainDomainMatches) {
                return true;
            }

            openInExternalBrowser(url);
            return false;
        } catch (error) {
            console.error('URL parsing error:', error);
            return true;
        }
    };

    const handleError = () => { setIsError(true); setIsLoading(false); };
    const retryLoading = () => { if (configError) fetchAppConfig(); else { setIsError(false); setIsLoading(true); webViewRef.current?.reload(); } };
    const onRefresh = () => { setIsRefreshing(true); if (configError) fetchAppConfig(); else webViewRef.current?.reload(); setTimeout(() => setIsRefreshing(false), 1500); };
    const onLoadProgress = ({ nativeEvent }: any) => setProgress(nativeEvent.progress);

    const renderOfflineView = () => (
        <View style={styles.offlineContainer}>
            <View style={styles.offlineIconContainer}>
                <Text style={styles.offlineIcon}>📶</Text>
            </View>
            <Text style={styles.offlineTitle}>No Internet Connection</Text>
            <Text style={styles.offlineMessage}>Please check your connection and try again</Text>
            <TouchableOpacity style={styles.retryButton} onPress={retryLoading}>
                <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
        </View>
    );

    const renderErrorView = () => (
        <ScrollView contentContainerStyle={styles.errorContainer} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={['#4A90E2']} tintColor="#4A90E2" />}>
            <Text style={styles.errorTitle}>We're Currently Under Maintenance</Text>
            <Text style={styles.maintenanceEmoji}>🛠️</Text>
            <Text style={styles.errorMessage}>Our team is working hard to improve your experience. Please try again in a few moments.</Text>
            <TouchableOpacity style={styles.retryButton} onPress={retryLoading}>
                <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <Text style={styles.pullToRefreshHint}>Pull down to refresh</Text>
        </ScrollView>
    );

    const renderConfigLoadingView = () => (
        <View style={styles.loaderContainer}>
            <View style={styles.loadingCard}>
                <ActivityIndicator size="large" color="#4A90E2"/>
                <Text style={styles.loadingText}>Loading application...</Text>
                <Text style={styles.loadingSubtext}>Please wait while we prepare everything for you</Text>
            </View>
        </View>
    );

    const renderConfigErrorView = () => (
        <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Connection Error</Text>
            <Text style={styles.maintenanceEmoji}>⚠️</Text>
            <Text style={styles.errorMessage}>We're having trouble connecting to our servers. This might be due to your internet connection or our servers may be temporarily unavailable.</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchAppConfig}>
                <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
        </View>
    );

    if (isOffline) return renderOfflineView();
    if (configLoading) return renderConfigLoadingView();
    if (configError) return renderConfigErrorView();
    if (!appConfig) return renderConfigErrorView();

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#fff" translucent={false} />
            <AppUpdateChecker /> {/* Add the update checker component */}
            {isError ? renderErrorView() : (
                <View style={styles.webContainer}>
                    {isLoading && (
                        <View style={styles.progressBarContainer}>
                            <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
                        </View>
                    )}
                    <WebView
                        ref={webViewRef}
                        source={{ uri: appConfig.main_domain, headers: { 'X-API-Key': 'QX-API-42f9e94d3c2be1b3', 'X-App-Version': '1.2.0', 'X-Device-Type': Platform.OS } }}
                        onNavigationStateChange={onNavigationStateChange}
                        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
                        onMessage={onMessage}
                        onError={handleError}
                        onLoadProgress={onLoadProgress}
                        javaScriptEnabled
                        domStorageEnabled
                        thirdPartyCookiesEnabled
                        sharedCookiesEnabled
                        cacheEnabled={true}
                        originWhitelist={['*']}
                        allowsBackForwardNavigationGestures={true}
                        userAgent={Platform.OS === 'ios' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1' : 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.101 Mobile Safari/537.36'}
                        renderLoading={() => (
                            <View style={styles.loaderContainer}>
                                <ActivityIndicator size="large" color="#4A90E2"/>
                            </View>
                        )}
                    />
                </View>
            )}
        </View>
    );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    webContainer: { flex: 1, position: 'relative' },
    progressBarContainer: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#E0E0E0', zIndex: 10 },
    progressBar: { height: '100%', backgroundColor: '#4A90E2', borderRadius: 3 },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F8FB' },
    loadingCard: { width: width * 0.85, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
    loadingText: { marginTop: 20, fontSize: 18, fontWeight: '600', color: '#333' },
    loadingSubtext: { marginTop: 10, fontSize: 14, color: '#666', textAlign: 'center' },
    offlineContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#F5F8FB' },
    offlineIconContainer: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#E8EEF4', justifyContent: 'center', alignItems: 'center', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    offlineIcon: { fontSize: 45 },
    offlineTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 12, color: '#333' },
    offlineMessage: { fontSize: 16, textAlign: 'center', marginBottom: 30, color: '#666', paddingHorizontal: 20 },
    retryButton: { backgroundColor: '#4A90E2', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 30, shadowColor: '#4A90E2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
    retryButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#F5F8FB' },
    errorTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 12, color: '#333', textAlign: 'center' },
    maintenanceEmoji: { fontSize: 70, marginVertical: 20 },
    errorMessage: { fontSize: 16, textAlign: 'center', marginBottom: 30, color: '#666', lineHeight: 24, paddingHorizontal: 20 },
    pullToRefreshHint: { marginTop: 24, color: '#999', fontSize: 14 }
});

export default App;