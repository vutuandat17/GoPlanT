import { StyleSheet, Text, View } from '@/components/app-primitives';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { GoPlantColors as C, GoPlantTypography as F } from '@/constants/theme';
import { formatDateVi } from '@/features/schedule/CareScheduleStore';
import type { ApiGrowthRecord } from '@/services/api';

type Props = {
  records: ApiGrowthRecord[];
};

export function GrowthChart({ records }: Props) {
  const heightPoints = records.filter((r) => r.heightCm != null);
  if (heightPoints.length === 0) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyText}>Chưa có số liệu chiều cao (cm) để vẽ biểu đồ đường.</Text>
      </View>
    );
  }

  const width = 300;
  const height = 148;
  const padLeft = 34;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 26;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const values = heightPoints.map((p) => Number(p.heightCm));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = maxVal - minVal < 1 ? 10 : (maxVal - minVal) * 1.15;
  const base = Math.max(0, minVal - span * 0.1);
  const top = base + span;

  const coords = heightPoints.map((item, index) => {
    const x =
      heightPoints.length === 1
        ? padLeft + chartW / 2
        : padLeft + (index / (heightPoints.length - 1)) * chartW;
    const ratio = (Number(item.heightCm) - base) / (top - base || 1);
    const y = padTop + chartH - ratio * chartH;
    return { x, y, val: Number(item.heightCm), date: item.recordedDate };
  });

  const polylinePoints = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];

  return (
    <View style={s.wrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0, 0.5, 1].map((step) => {
          const y = padTop + chartH * step;
          return (
            <Line
              key={step}
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="#DCE7DE"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          );
        })}
        <SvgText x={2} y={padTop + 4} fill={C.mutedText} fontSize={9}>
          {`${Math.round(top)}cm`}
        </SvgText>
        <SvgText x={2} y={padTop + chartH + 3} fill={C.mutedText} fontSize={9}>
          {`${Math.round(base)}cm`}
        </SvgText>

        {coords.length > 1 ? (
          <Polyline fill="none" stroke="#1E4B38" strokeWidth={2.5} points={polylinePoints} />
        ) : null}

        {coords.map((pt, idx) => (
          <Circle key={`${pt.date}-${idx}`} cx={pt.x} cy={pt.y} r={4} fill="#3E9B72" stroke="#FFFFFF" strokeWidth={1.5} />
        ))}

        {coords.map((pt, idx) => {
          const showValue = idx === 0 || idx === coords.length - 1 || coords.length <= 5;
          if (!showValue) return null;
          return (
            <SvgText
              key={`lbl-${idx}`}
              x={pt.x}
              y={Math.max(11, pt.y - 8)}
              fill={C.forest}
              fontSize={9}
              fontWeight="600"
              textAnchor="middle">
              {`${pt.val}`}
            </SvgText>
          );
        })}

        <SvgText x={first.x} y={height - 6} fill={C.secondaryText} fontSize={9} textAnchor="start">
          {formatDateVi(first.date).slice(0, 5)}
        </SvgText>
        {coords.length > 1 ? (
          <SvgText x={last.x} y={height - 6} fill={C.secondaryText} fontSize={9} textAnchor="end">
            {formatDateVi(last.date).slice(0, 5)}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 4, borderRadius: 12, backgroundColor: C.softSurface, paddingHorizontal: 6 },
  empty: { padding: 14, borderRadius: 12, backgroundColor: C.softSurface, alignItems: 'center' },
  emptyText: { color: C.secondaryText, fontFamily: F.regular, fontSize: 11, textAlign: 'center' },
});
