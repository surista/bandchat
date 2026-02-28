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
import StatsScreen from '../screens/band/StatsScreen';
import BandMembersScreen from '../screens/band/BandMembersScreen';
import AvailabilityScreen from '../screens/band/AvailabilityScreen';
import ContactsScreen from '../screens/band/ContactsScreen';
import AnnouncementsScreen from '../screens/band/AnnouncementsScreen';
import PollsScreen from '../screens/band/PollsScreen';
import MedleyListScreen from '../screens/band/MedleyListScreen';
import MedleyDetailScreen from '../screens/band/MedleyDetailScreen';
import RecordingListScreen from '../screens/band/RecordingListScreen';
import RecordingDetailScreen from '../screens/band/RecordingDetailScreen';
import TimelineScreen from '../screens/band/TimelineScreen';
import AchievementsScreen from '../screens/band/AchievementsScreen';
import KittyScreen from '../screens/band/KittyScreen';
import SongIntelligenceScreen from '../screens/band/SongIntelligenceScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import EditProfileScreen from '../screens/settings/EditProfileScreen';
import SecurityScreen from '../screens/settings/SecurityScreen';
import AppearanceScreen from '../screens/settings/AppearanceScreen';
import NotificationsScreen from '../screens/settings/NotificationsScreen';
import WorkspaceMembersScreen from '../screens/settings/WorkspaceMembersScreen';
import InviteScreen from '../screens/settings/InviteScreen';
import MemberProfileScreen from '../screens/workspace/MemberProfileScreen';
import SearchScreen from '../screens/workspace/SearchScreen';
import ChannelSettingsScreen from '../screens/workspace/ChannelSettingsScreen';
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
      <Stack.Screen name="Stats" component={StatsScreen} options={{ title: 'Stats' }} />
      <Stack.Screen name="BandMembers" component={BandMembersScreen} options={{ title: 'Members' }} />
      <Stack.Screen name="Availability" component={AvailabilityScreen} options={{ title: 'Availability' }} />
      <Stack.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Contacts' }} />
      <Stack.Screen name="Announcements" component={AnnouncementsScreen} options={{ title: 'Announcements' }} />
      <Stack.Screen name="Polls" component={PollsScreen} options={{ title: 'Polls' }} />
      <Stack.Screen name="MedleyList" component={MedleyListScreen} options={{ title: 'Medleys' }} />
      <Stack.Screen name="MedleyDetail" component={MedleyDetailScreen} options={{ title: 'Medley' }} />
      <Stack.Screen name="RecordingList" component={RecordingListScreen} options={{ title: 'Recordings' }} />
      <Stack.Screen name="RecordingDetail" component={RecordingDetailScreen} options={{ title: 'Recording' }} />
      <Stack.Screen name="Timeline" component={TimelineScreen} options={{ title: 'Timeline' }} />
      <Stack.Screen name="Achievements" component={AchievementsScreen} options={{ title: 'Achievements' }} />
      <Stack.Screen name="Kitty" component={KittyScreen} options={{ title: 'Band Kitty' }} />
      <Stack.Screen name="SongIntelligence" component={SongIntelligenceScreen} options={{ title: 'Song Intelligence' }} />

      {/* Settings */}
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="Security" component={SecurityScreen} options={{ title: 'Security' }} />
      <Stack.Screen name="Appearance" component={AppearanceScreen} options={{ title: 'Appearance' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <Stack.Screen name="WorkspaceMembers" component={WorkspaceMembersScreen} options={{ title: 'Members' }} />
      <Stack.Screen name="Invite" component={InviteScreen} options={{ title: 'Invite People' }} />

      {/* Members */}
      <Stack.Screen name="MemberProfile" component={MemberProfileScreen} options={{ title: 'Member' }} />

      {/* Search & Channel Management */}
      <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Search' }} />
      <Stack.Screen name="ChannelSettings" component={ChannelSettingsScreen} options={{ title: 'Channel Settings' }} />
    </Stack.Navigator>
  );
}
