import React, { useEffect, useState } from 'react';
import { Alert, Button, Platform, View, Text, StyleSheet, Linking, AppState, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DocumentPicker from 'react-native-document-picker';
import RNFetchBlob from 'rn-fetch-blob';

type UpdateInfo = {
  updateAvailable: boolean;
  version: string;
  releaseDate: string;
  updateNotes: string;
  downloadUrl: string;
  isMandatory: boolean;
};

const AppUpdateChecker = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkForUpdates();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const handleAppStateChange = async (nextAppState: string): Promise<void> => {
    if (nextAppState === 'active') {
      const pendingInstall: string | null = await AsyncStorage.getItem('pendingInstall');
      if (pendingInstall === 'true') {
        promptForInstallation();
      }
    }
  };

  const checkForUpdates = async () => {
    try {
      const currentAppVersion = '1.3.0';
      const response = await fetch('https://api.quotesx.online/api/update-check', {
        method: 'GET',
        headers: {
          'X-App-Version': currentAppVersion,
          'X-API-Key': 'a7d9b560-4f9f-4bb3-b287-fa5c1c59a52c', 
          'X-Platform': Platform.OS,
          'Content-Type': 'application/json'
        },
      });
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }
      
      const data = await response.json();
      
      // Validate the response data has all required fields
      if (!validateUpdateInfo(data)) {
        throw new Error('Invalid update information received from API');
      }
      
      setUpdateInfo(data);

      if (data.updateAvailable) {
        promptForUpdate();
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      setError(error instanceof Error ? error.message : 'Unknown error checking for updates');
    }
  };

  // Helper function to validate the update info object
  const validateUpdateInfo = (data: any): data is UpdateInfo => {
    return (
      typeof data === 'object' &&
      data !== null &&
      typeof data.updateAvailable === 'boolean' &&
      typeof data.version === 'string' &&
      typeof data.releaseDate === 'string' &&
      typeof data.updateNotes === 'string' &&
      typeof data.downloadUrl === 'string' &&
      typeof data.isMandatory === 'boolean'
    );
  };

  const promptForUpdate = () => {
    if (!updateInfo) return;
    
    Alert.alert(
      'App Update Available',
      `Version ${updateInfo.version} is now available\n\n${updateInfo.updateNotes}`,
      [
        {
          text: 'Update Later',
          onPress: () => {},
          style: 'cancel'
        },
        {
          text: 'Update Now',
          onPress: startDownload,
          style: 'destructive'
        }
      ]
    );
  };

  const startDownload = async () => {
    if (!updateInfo || !updateInfo.downloadUrl) {
      setError('Download URL is missing');
      Alert.alert('Error', 'Cannot download update: missing download URL');
      return;
    }

    setDownloading(true);
    setDownloadProgress(0);
    setError(null);

    const { config, fs } = RNFetchBlob;
    const androidDownloadsDir = fs.dirs.DownloadDir;
    const iosDocumentsDir = fs.dirs.DocumentDir;

    const downloadDir = Platform.OS === 'android' 
      ? androidDownloadsDir 
      : iosDocumentsDir;

    const options = config({
      fileCache: true,
      addAndroidDownloads: {
        useDownloadManager: true,
        notification: true,
        title: `Downloading App v${updateInfo.version}`,
        description: updateInfo.updateNotes || 'App update',
        path: `${downloadDir}/app-update.apk`,
        mime: 'application/vnd.android.package-archive'
      }
    });

    const download = options.fetch('GET', updateInfo.downloadUrl);

    download.progress((received, total) => {
      const progress = Math.floor((received / total) * 100);
      setDownloadProgress(progress);
    });

    try {
      const res = await download;
      setDownloadProgress(100);
      setDownloading(false);
      await AsyncStorage.setItem('pendingInstall', 'true');
      promptForInstallation();
    } catch (error) {
      console.error('Download failed:', error);
      setDownloading(false);
      setError('Failed to download update');
      Alert.alert('Download Error', 'Failed to download the update. Please try again later.');
    }
  };

  const promptForInstallation = () => {
    Alert.alert(
      'Install Update',
      'The update has been downloaded. Do you want to install it now?',
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel'
        },
        {
          text: 'Install',
          onPress: installUpdate,
          style: 'destructive'
        }
      ]
    );
  };

  const installUpdate = async () => {
    setInstalling(true);
    setError(null);
    
    const { fs } = RNFetchBlob;
    const androidDownloadsDir = fs.dirs.DownloadDir;
    const apkPath = `${androidDownloadsDir}/app-update.apk`;

    if (Platform.OS === 'android') {
      try {
        const granted = await DocumentPicker.pick();
        if (granted) {
          await Linking.openURL(`file://${apkPath}`);
        }
      } catch (error) {
        console.error('Install failed:', error);
        setError('Failed to install update');
        Alert.alert('Installation Error', 'Failed to start installation. Please try again.');
      }
    } else if (Platform.OS === 'ios') {
      // For iOS, we would typically redirect to the App Store
      try {
        // This assumes you've properly configured your app to open the App Store
        if (updateInfo?.downloadUrl) {
          await Linking.openURL(updateInfo.downloadUrl);
        } else {
          throw new Error('App Store URL not available');
        }
      } catch (error) {
        console.error('Failed to open App Store:', error);
        setError('Failed to open App Store');
        Alert.alert('Error', 'Failed to open the App Store. Please update manually.');
      }
    }
    
    setInstalling(false);
    await AsyncStorage.removeItem('pendingInstall');
  };

  // Display error message if there's an error
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={checkForUpdates}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // If no update info or update is not available, return null (nothing to show)
  if (!updateInfo || !updateInfo.updateAvailable) return null;

  // If update is available, show the update UI
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Update Available</Text>
      <Text style={styles.version}>Version: {updateInfo.version}</Text>
      <Text style={styles.notes}>{updateInfo.updateNotes}</Text>
      
      {!downloading && !installing && (
        <Button 
          title="Update Now" 
          onPress={startDownload} 
          disabled={downloading || installing} 
        />
      )}
      
      {downloading && (
        <View style={styles.progressContainer}>
          <Text>{downloadProgress}% Complete</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progress, { width: `${downloadProgress}%` }]} />
          </View>
        </View>
      )}
      
      {installing && (
        <View style={styles.installingContainer}>
          <Text>Installing update...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 16,
    borderRadius: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  version: {
    fontSize: 16,
    marginBottom: 8,
  },
  notes: {
    fontSize: 14,
    marginBottom: 16,
  },
  progressContainer: {
    marginTop: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progress: {
    height: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#ffebee',
    borderWidth: 1,
    borderColor: '#ffcdd2',
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#c62828',
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: '#ef5350',
    padding: 8,
    borderRadius: 4,
    alignItems: 'center',
  },
  retryText: {
    color: 'white',
    fontWeight: 'bold',
  },
  installingContainer: {
    marginTop: 16,
    alignItems: 'center',
  }
});

export default AppUpdateChecker;