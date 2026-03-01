import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors } from "../theme";

type Props = {
  visible: boolean;
  title: string;
  lines: string[];
  tone?: "success" | "danger" | "info";
  onClose: () => void;
  onViewPigeons?: () => void;
};

export function ActionResultModal({ visible, title, lines, tone = "info", onClose, onViewPigeons }: Props) {
  const toneColor = tone === "success" ? Colors.success : tone === "danger" ? Colors.error : Colors.accent;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={[styles.title, { color: toneColor }]}>{title}</Text>
          <View style={styles.body}>
            {lines.map((line, idx) => (
              <Text key={`${idx}:${line}`} style={styles.line}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose}>
              <Text style={styles.btnText}>Close</Text>
            </TouchableOpacity>
            {onViewPigeons ? (
              <TouchableOpacity style={styles.btn} onPress={onViewPigeons}>
                <Text style={styles.btnText}>View Pigeons</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  body: {
    marginTop: 10,
    gap: 6,
  },
  line: {
    color: Colors.textMain,
    fontSize: 14,
  },
  actions: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  btn: {
    borderWidth: 1,
    borderColor: "rgba(216,176,117,0.5)",
    backgroundColor: "rgba(216,176,117,0.2)",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  btnGhost: {
    backgroundColor: "transparent",
    borderColor: "rgba(216,176,117,0.25)",
  },
  btnText: {
    color: Colors.textMain,
    fontWeight: "700",
    fontSize: 14,
  },
});
