import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WorkspaceListScreen from '../screens/workspaces/WorkspaceListScreen';
import ChannelListScreen from '../screens/workspace/ChannelListScreen';
import ChannelScreen from '../screens/workspace/ChannelScreen';
import ThreadScreen from '../screens/workspace/ThreadScreen';
import SongListScreen from '../screens/band/SongListScreen';
import SongDetailScreen from '../screens/band/SongDetailScreen';
import SetlistListScreen from '../screens/band/SetlistListScreen';
import SetlistDetailScreen from '../screens/band/SetlistDetailScreen';
import GigListScreen from '../screens/band/GigListScreen';
import GigDetailScreen from '../screens/band/GigDetailScreen';
import { useTheme } from '../context/ThemeContext';

const Stack = createNativeStackNavigator();

export default function AppStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: colors.bgPrimary },
      }}
    >
      <Stack.Screen
        name="WorkspaceList"
        component={WorkspaceListScreen}
        options={{ title: 'BandChat', headerShown: false }}
      />
      <Stack.Screen
        name="Workspace"
        component={ChannelListScreen}
        options={({ route }) => ({ title: route.params?.name || 'Workspace' })}
      />
      <Stack.Screen
        name="Channel"
        component={ChannelScreen}
        options={({ route }) => {
          const ch = route.params?.channel;
          const isDM = ch?.isDM;
          if (isDM) {
            return { title: ch?.displayName || 'Direct Message' };
          }
          const prefix = ch?.isPrivate ? '\u{1F512} ' : '# ';
          return { title: prefix + (ch?.name || 'Channel') };
        }}
      />
      <Stack.Screen
        name="Thread"
        component={ThreadScreen}
        options={{ title: 'Thread' }}
      />

      {/* Band Features */}
      <Stack.Screen name="SongList" component={SongListScreen} options={{ title: 'Songs' }} />
      <Stack.Screen name="SongDetail" component={SongDetailScreen} options={{ title: 'Song' }} />
      <Stack.Screen name="SetlistList" component={SetlistListScreen} options={{ title: 'Setlists' }} />
      <Stack.Screen name="SetlistDetail" component={SetlistDetailScreen} options={{ title: 'Setlist' }} />
      <Stack.Screen name="GigList" component={GigListScreen} options={{ title: 'Calendar' }} />
      <Stack.Screen name="GigDetail" component={GigDetailScreen} options={{ title: 'Event' }} />
    </Stack.Navigator>
  );
}
