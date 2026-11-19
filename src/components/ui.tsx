import { useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useApp } from '../state/AppContext';

export const C = { primary: '#00594C', accent: '#E07A1F', danger: '#B3261E', bg: '#F4F6F5', text: '#1B1F1E', muted: '#6B7672', border: '#D5DBD9' };

export function Button({ title, onPress, variant = 'primary', disabled, busy }: {
  title: string; onPress: () => void; variant?: 'primary' | 'accent' | 'danger' | 'ghost'; disabled?: boolean; busy?: boolean;
}) {
  const bg = variant === 'ghost' ? 'transparent' : C[variant];
  return (
    <Pressable onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }, variant === 'ghost' && s.ghost]}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={[s.btnText, variant === 'ghost' && { color: C.primary }]}>{title}</Text>}
    </Pressable>
  );
}

export const Label = ({ children }: { children: ReactNode }) => <Text style={s.label}>{children}</Text>;

export const Input = (p: TextInputProps) => (
  <TextInput placeholderTextColor={C.muted} {...p} style={[s.input, p.multiline && { minHeight: 90, textAlignVertical: 'top' }, p.style]} />
);

/** Dropdown simples (modal) — sem dependência externa. multi=true permite múltipla escolha ("; "). */
export function Select({ value, options, onChange, placeholder = 'Selecione…', multi, allowClear }: {
  value: string | null; options: readonly string[]; onChange: (v: string | null) => void;
  placeholder?: string; multi?: boolean; allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = multi ? (value ? value.split('; ') : []) : [];
  const pick = (o: string) => {
    if (!multi) { onChange(o); setOpen(false); return; }
    const next = selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o];
    onChange(next.length ? options.filter((x) => next.includes(x)).join('; ') : null);
  };
  return (
    <>
      <Pressable style={s.input} onPress={() => setOpen(true)}>
        <Text style={{ color: value ? C.text : C.muted }}>{value || placeholder}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <View style={s.sheet}>
            <FlatList data={allowClear ? ['', ...options] : [...options]} keyExtractor={(o) => o || '_'}
              renderItem={({ item: o }) => {
                const on = multi ? selected.includes(o) : o === value;
                return (
                  <Pressable style={s.opt} onPress={() => (o ? pick(o) : (onChange(null), setOpen(false)))}>
                    <Text style={[{ fontSize: 16 }, on && { color: C.primary, fontWeight: '700' }]}>{o ? `${multi ? (on ? '☑ ' : '☐ ') : ''}${o}` : '(Todos / limpar)'}</Text>
                  </Pressable>
                );
              }} />
            {multi && <Button title="OK" onPress={() => setOpen(false)} />}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/** Cabeçalho com voltar, status de rede, contador de pendentes e "Sincronizar Agora". */
export function Header({ title, canBack = true }: { title: string; canBack?: boolean }) {
  const { back, online, pending, syncing, sync } = useApp();
  return (
    <View style={s.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {canBack && <Pressable onPress={back} hitSlop={12}><Text style={s.hText}>‹ </Text></Pressable>}
        <Text style={[s.hText, { flex: 1 }]} numberOfLines={1}>{title}</Text>
        <Text style={{ color: online ? '#9FE2BF' : '#FFB4A9', fontWeight: '600' }}>{online ? '● Online' : '● Offline'}</Text>
      </View>
      <View style={s.syncRow}>
        <Text style={{ color: '#fff' }}>Pendentes de envio: <Text style={{ fontWeight: '800' }}>{pending}</Text></Text>
        <Pressable onPress={() => sync()} disabled={syncing || !online} style={[s.syncBtn, (!online || syncing) && { opacity: 0.5 }]}>
          {syncing ? <ActivityIndicator color={C.primary} size="small" /> : <Text style={{ color: C.primary, fontWeight: '700' }}>Sincronizar Agora</Text>}
        </Pressable>
      </View>
    </View>
  );
}

export const s = StyleSheet.create({
  btn: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', marginVertical: 6 },
  ghost: { borderWidth: 1, borderColor: C.primary },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  label: { fontWeight: '700', color: C.text, marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 12, fontSize: 16, color: C.text },
  backdrop: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', maxHeight: '70%', padding: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  opt: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  header: { backgroundColor: C.primary, padding: 14, paddingTop: 8 },
  hText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  syncRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  syncBtn: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  body: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: C.border },
});
