import React, { useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Card } from "../components/Card";
import { Colors, Spacing } from "../theme";

const SECTIONS = [
  {
    title: "Getting Started",
    content: [
      "Crownforge is a live kingdom strategy game where economy, timing, and intel matter more than random aggression.",
      "Start by stabilizing food and gold income before queuing large military batches.",
      "Use Overview every session to check upkeep, population status, and current season bonuses.",
      "Early consistency beats risky openings: build steady, scout often, and expand when ready.",
    ],
  },
  {
    title: "Economy and Growth",
    content: [
      "Gold is driven by taxes, and taxes directly affect peasant growth.",
      "Higher tax rates improve short-term income but slow long-term population momentum.",
      "Food is your stability resource. If production drops below upkeep, growth stalls and recovery gets expensive.",
      "Land from Explore creates room for more buildings and stronger resource scaling.",
      "Wood and stone are construction bottlenecks, so keep both flowing while expanding.",
    ],
  },
  {
    title: "Buildings and Queues",
    content: [
      "Building choices define your kingdom identity: economy-first, military-first, or balanced.",
      "Use queue time intentionally. Avoid idle queues when you are online and planning to grow.",
      "Barracks, ranges, and stables unlock military options; temples and guildhalls unlock utility power.",
      "Do not overbuild one area too early. Keep resource production, military unlocks, and defense in step.",
    ],
  },
  {
    title: "Combat Basics",
    content: [
      "Strong attacks start with intel: Spy first, then send only the troops needed for the target.",
      "Use role-based armies. Mix units by purpose instead of training one unit blindly.",
      "Explore is the safe expansion tool. Attacks are higher reward but require preparation and recovery planning.",
      "After each war action, recheck food, upkeep, and defense before launching the next hit.",
    ],
  },
  {
    title: "Research and Faith",
    content: [
      "Research gives permanent kingdom power. Focus on one strategic lane instead of spreading levels too thin.",
      "Priests generate mana, and mana fuels prayers with timed combat or economy impact.",
      "Use prayers for specific windows: push, defend, recover, or spike production.",
      "Season modifiers and prayer timing together can create major advantage swings.",
    ],
  },
  {
    title: "Alliance Play",
    content: [
      "Alliances multiply strength through timing, shared intel, and coordinated target selection.",
      "Use alliance forums and pigeons to call windows and confirm return times.",
      "Diplomacy matters: avoiding the wrong war can be more valuable than winning a small one.",
      "Kingdoms that communicate clearly usually outperform kingdoms with higher raw numbers.",
    ],
  },
  {
    title: "Common Mistakes",
    content: [
      "Overtaxing early and starving long-term peasant growth.",
      "Overtraining troops before economy can support upkeep.",
      "Attacking without spy data and losing value on bad sends.",
      "Ignoring queue uptime and letting growth windows pass.",
      "Playing alone in a team game where coordination is a major edge.",
    ],
  },
];

export function HowToPlayScreen() {
  const [expanded, setExpanded] = useState<number | null>(0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>How to Play</Text>
        <Text style={styles.pageSubtitle}>Crownforge Player Guide</Text>

        {SECTIONS.map((section, i) => (
          <Card key={i} style={{ marginBottom: 0 }}>
            <TouchableOpacity
              onPress={() => setExpanded(expanded === i ? null : i)}
              style={styles.sectionHeader}
              activeOpacity={0.7}
            >
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.chevron}>{expanded === i ? "-" : "+"}</Text>
            </TouchableOpacity>

            {expanded === i && (
              <View style={styles.sectionBody}>
                {section.content.map((line, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={styles.bullet}>-</Text>
                    <Text style={styles.bulletText}>{line}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Plan clean. Time your windows. Win the long game.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.sm },
  pageTitle: { fontSize: 26, fontWeight: "900", color: Colors.accent, textAlign: "center", marginBottom: 4 },
  pageSubtitle: { fontSize: 13, color: Colors.textMuted, textAlign: "center", marginBottom: 8, letterSpacing: 0.5 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.textMain, flex: 1 },
  chevron: { color: Colors.textMuted, fontSize: 12 },
  sectionBody: { marginTop: 12, gap: 8 },
  bulletRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  bullet: { color: Colors.accent, fontSize: 14, lineHeight: 20 },
  bulletText: { flex: 1, fontSize: 13, color: Colors.textMuted, lineHeight: 20 },
  footer: { paddingVertical: 16, alignItems: "center" },
  footerText: { fontSize: 14, color: Colors.textMuted, fontStyle: "italic" },
});
