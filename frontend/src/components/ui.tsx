// Shared UI primitives used across every screen.

import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/lib/theme';
import type { Priority } from '@/lib/types';
import { useTheme } from '@/lib/use-theme';

// Space reserved for the floating web tab bar at the top of the page.
const WebTabBarHeight = 96;

export function Screen({
  title,
  subtitle,
  action,
  nav,
  footer,
  maxWidth = MaxContentWidth,
  children,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  nav?: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const paddingTop = Platform.OS === 'web' ? WebTabBarHeight : insets.top + Spacing.three;
  const paddingBottom = insets.bottom + BottomTabInset + Spacing.five;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[styles.scrollContent, { paddingTop, paddingBottom }]}
      keyboardShouldPersistTaps="handled">
      <View style={[styles.inner, { maxWidth }]}>
        {nav}
        {title ? (
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText style={styles.title}>{title}</ThemedText>
              {subtitle ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {subtitle}
                </ThemedText>
              ) : null}
            </View>
            {action}
          </View>
        ) : null}
        {children}
        {footer}
      </View>
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  highlighted,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  highlighted?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: highlighted ? theme.accent : 'transparent' },
        style,
      ]}>
      {children}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'destructive' | 'ghost';

export function AppButton({
  label,
  onPress,
  variant = 'secondary',
  size = 'md',
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const background = {
    primary: theme.accent,
    secondary: theme.backgroundSelected,
    danger: theme.dangerBackground,
    destructive: theme.danger,
    ghost: 'transparent',
  }[variant];
  const color = {
    primary: theme.accentText,
    secondary: theme.text,
    danger: theme.danger,
    destructive: theme.accentText,
    ghost: theme.accent,
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSmall,
        { backgroundColor: background, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}>
      <Text style={[styles.buttonLabel, size === 'sm' && styles.buttonLabelSmall, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const theme = useTheme();
  const colors = {
    neutral: [theme.backgroundSelected, theme.textSecondary],
    success: [theme.successBackground, theme.success],
    warning: [theme.warningBackground, theme.warning],
    danger: [theme.dangerBackground, theme.danger],
    accent: [theme.accentBackground, theme.accent],
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: colors[0] }]}>
      <Text style={[styles.badgeLabel, { color: colors[1] }]}>{label}</Text>
    </View>
  );
}

const priorityTone: Record<Priority, BadgeTone> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const label = priority.charAt(0).toUpperCase() + priority.slice(1);
  return <Badge label={`${label} priority`} tone={priorityTone[priority]} />;
}

export function StatusBadge({ isOpen }: { isOpen: boolean }) {
  return <Badge label={isOpen ? 'Open' : 'Closed'} tone={isOpen ? 'success' : 'neutral'} />;
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
      {children}
    </ThemedText>
  );
}

export function SearchInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}>
      <Text style={[styles.searchIcon, { color: theme.textSecondary }]}>⌕</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        style={[styles.searchInput, { color: theme.text }]}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeText('')}>
          <Text style={[styles.searchClear, { color: theme.textSecondary }]}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, { backgroundColor: selected ? theme.text : theme.backgroundSelected }]}>
            <Text style={[styles.chipLabel, { color: selected ? theme.background : theme.text }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Labelled form row: label, optional required marker, hint or accessory, and an error line.
export function Field({
  label,
  required,
  error,
  hint,
  accessory,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  accessory?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <ThemedText type="smallBold">
          {label}
          {required ? <Text style={{ color: theme.danger }}> *</Text> : null}
        </ThemedText>
        {accessory ??
          (hint ? (
            <ThemedText type="small" themeColor="textSecondary">
              {hint}
            </ThemedText>
          ) : null)}
      </View>
      {children}
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

// Text input matching the app's field styling; `error` switches the border to the danger color.
export function TextField({ error, style, ...rest }: TextInputProps & { error?: string }) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...rest}
      style={[
        styles.input,
        {
          color: theme.text,
          backgroundColor: theme.background,
          borderColor: error ? theme.danger : theme.backgroundSelected,
        },
        rest.multiline && styles.multiline,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontSize: 18,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    // The surrounding box already shows the field; hide the browser's inner focus ring.
    outlineWidth: 0,
  },
  searchClear: {
    fontSize: 14,
    padding: Spacing.one,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: 600,
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  headerText: {
    flexShrink: 1,
    gap: Spacing.half,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: 700,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 2,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: 600,
  },
  buttonLabelSmall: {
    fontSize: 13,
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: 600,
  },
  field: {
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: Spacing.two,
  },
});
