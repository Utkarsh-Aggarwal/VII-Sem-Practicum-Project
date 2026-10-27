import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import type { VoicePhase } from "../useVoiceTalk";

const COLORS: Record<VoicePhase, { face: string; ring: string }> = {
  idle: { face: "#4f46e5", ring: "#a5b4fc" },
  listening: { face: "#e11d48", ring: "#fda4af" },
  thinking: { face: "#64748b", ring: "#cbd5e1" },
  speaking: { face: "#059669", ring: "#6ee7b7" },
};

function loop(anim: Animated.CompositeAnimation) {
  const l = Animated.loop(anim);
  l.start();
  return l;
}

// Saathi's face. Idle: breathes and blinks. Listening: rings ripple out. Thinking: dots bounce.
// Speaking: the mouth moves and rings pulse. Built with the core Animated API (works in Expo Go).
export function SaathiAvatar({ phase, size = 150 }: { phase: VoicePhase; size?: number }) {
  const breath = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const mouth = useRef(new Animated.Value(0.35)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  // Breathing + blinking, always on.
  useEffect(() => {
    const b = loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const k = loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(blink, { toValue: 0.1, duration: 90, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 120, useNativeDriver: true }),
      ])
    );
    return () => {
      b.stop();
      k.stop();
    };
  }, [breath, blink]);

  // Phase-specific motion.
  useEffect(() => {
    const running: Animated.CompositeAnimation[] = [];
    ring.setValue(0);
    mouth.setValue(phase === "speaking" ? 0.6 : 0.35);
    dots.forEach((d) => d.setValue(0));

    if (phase === "listening" || phase === "speaking") {
      running.push(loop(Animated.timing(ring, { toValue: 1, duration: phase === "listening" ? 1100 : 1500, easing: Easing.out(Easing.quad), useNativeDriver: true })));
    }
    if (phase === "speaking") {
      // Irregular open/close so it reads as talking, not a metronome.
      const steps = [1, 0.4, 0.85, 0.3, 1.1, 0.5, 0.7, 0.25];
      running.push(loop(Animated.sequence(steps.map((v, i) => Animated.timing(mouth, { toValue: v, duration: 90 + (i % 3) * 40, useNativeDriver: true })))));
    }
    if (phase === "thinking") {
      running.push(
        loop(
          Animated.stagger(
            160,
            dots.map((d) =>
              Animated.sequence([
                Animated.timing(d, { toValue: 1, duration: 260, useNativeDriver: true }),
                Animated.timing(d, { toValue: 0, duration: 260, useNativeDriver: true }),
              ])
            )
          )
        )
      );
    }
    return () => running.forEach((a) => a.stop());
  }, [phase, ring, mouth, dots]);

  const c = COLORS[phase];
  const faceScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  const eye = size * 0.1;

  return (
    <View style={{ width: size * 1.5, height: size * 1.5, alignItems: "center", justifyContent: "center" }} accessibilityLabel="Saathi">
      {(phase === "listening" || phase === "speaking") && (
        <Animated.View
          style={[
            styles.ring,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: c.ring, opacity: ringOpacity, transform: [{ scale: ringScale }] },
          ]}
        />
      )}
      <Animated.View
        style={[
          styles.face,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: c.face, transform: [{ scale: faceScale }] },
        ]}
      >
        <View style={[styles.eyes, { gap: size * 0.22, marginTop: size * 0.05 }]}>
          {[0, 1].map((i) => (
            <Animated.View
              key={i}
              style={{ width: eye, height: eye * 1.25, borderRadius: eye, backgroundColor: "#fff", transform: [{ scaleY: blink }] }}
            />
          ))}
        </View>
        {phase === "thinking" ? (
          <View style={[styles.dots, { marginTop: size * 0.12 }]}>
            {dots.map((d, i) => (
              <Animated.View
                key={i}
                style={{
                  width: size * 0.07,
                  height: size * 0.07,
                  borderRadius: size,
                  backgroundColor: "#fff",
                  transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.06] }) }],
                }}
              />
            ))}
          </View>
        ) : (
          <Animated.View
            style={{
              marginTop: size * 0.12,
              width: size * 0.32,
              height: size * 0.16,
              backgroundColor: "#fff",
              borderBottomLeftRadius: size * 0.16,
              borderBottomRightRadius: size * 0.16,
              borderTopLeftRadius: phase === "speaking" ? size * 0.16 : size * 0.03,
              borderTopRightRadius: phase === "speaking" ? size * 0.16 : size * 0.03,
              transform: [{ scaleY: mouth }],
            }}
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: "absolute" },
  face: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1e1b4b",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  eyes: { flexDirection: "row" },
  dots: { flexDirection: "row", gap: 8, height: 20, alignItems: "flex-end" },
});
