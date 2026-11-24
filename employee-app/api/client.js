import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// The server address and device key are entered once on the Setup screen and
// kept in secure storage. Use the computer's LAN address (e.g.
// http://192.168.1.10:5000/api), never "localhost": on a phone that is the phone.
const KEY_STORE = 'device_key';
const URL_STORE = 'api_base_url';
const DEFAULT_URL = process.env.EXPO_PUBLIC_API_URL || '';

let cache = { key: null, url: null, loaded: false };

export async function loadSettings() {
  const [key, url] = await Promise.all([SecureStore.getItemAsync(KEY_STORE), SecureStore.getItemAsync(URL_STORE)]);
  cache = { key, url: url || DEFAULT_URL, loaded: true };
  return cache;
}

export async function saveSettings({ url, key }) {
  const clean = url.trim().replace(/\/+$/, '');
  await SecureStore.setItemAsync(URL_STORE, clean);
  await SecureStore.setItemAsync(KEY_STORE, key.trim());
  cache = { key: key.trim(), url: clean, loaded: true };
}

export async function clearSettings() {
  await SecureStore.deleteItemAsync(KEY_STORE);
  await SecureStore.deleteItemAsync(URL_STORE);
  cache = { key: null, url: DEFAULT_URL, loaded: true };
}

export const isConfigured = () => !!(cache.key && cache.url);

const client = axios.create({ timeout: 20000 });
client.interceptors.request.use((config) => {
  config.baseURL = cache.url;
  if (cache.key) config.headers['X-Device-Key'] = cache.key;
  return config;
});

export default client;
