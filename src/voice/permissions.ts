import { AudioModule } from 'expo-audio';

export async function requestMicrophonePermission(): Promise<boolean> {
  const permission = await AudioModule.requestRecordingPermissionsAsync();
  return permission.granted;
}
