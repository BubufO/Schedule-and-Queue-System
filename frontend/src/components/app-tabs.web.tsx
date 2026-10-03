import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, View, StyleSheet, useWindowDimensions } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { MaxContentWidth, Spacing } from '@/lib/theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="login" href="/login" asChild>
            <TabButton>Login</TabButton>
          </TabTrigger>
          {/* Not shown in the bar, but still registered so login can route to the dashboards. */}
          <TabTrigger name="user" href="/user" style={styles.hidden} />
          <TabTrigger name="admin" href="/admin" style={styles.hidden} />
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

// Below this width the tab bar tightens its spacing.
const NarrowWidth = 520;

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const narrow = useWindowDimensions().width < NarrowWidth;
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={[styles.tabButtonView, narrow && styles.tabButtonViewNarrow]}>
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const narrow = useWindowDimensions().width < NarrowWidth;
  return (
    <View {...props} style={[styles.tabListContainer, narrow && styles.tabListContainerNarrow]}>
      <ThemedView
        type="backgroundElement"
        style={[styles.innerContainer, narrow && styles.innerContainerNarrow]}>
        <View style={styles.brand}>
          <ThemedText type="smallBold">QueueSmart</ThemedText>
        </View>

        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  tabListContainerNarrow: {
    paddingHorizontal: Spacing.two,
  },
  innerContainerNarrow: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  hidden: {
    display: 'none',
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  tabButtonViewNarrow: {
    paddingHorizontal: 10,
  },
});
