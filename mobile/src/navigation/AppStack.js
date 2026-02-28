import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WorkspaceListScreen from '../screens/workspaces/WorkspaceListScreen';
import { useTheme } from '../context/ThemeContext';
import { View, Text, StyleSheet } from 'react-native';

const Stack = createNativeStackNavigator();

function WorkspaceScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.placeholder, { backgroundColor: colors.bgPrimary }]}>
      <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
        Workspace view coming in Phase 2
      </Text>
    </View>
  );
}

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
        component={WorkspaceScreen}
        options={({ route }) => ({ title: route.params?.name || 'Workspace' })}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderText: {
    fontSize: 16,
  },
});
