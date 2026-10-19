import { describe, it, expect } from 'vitest';
import { parseBilingualVtt, buildBilingualVtt } from '../src/subtitle/vtt.jsx';

describe('VTT parser and builder tests', () => {
  const sampleVtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.500
The English language is fascinating.
英语这门语言非常迷人。
Words: [{"word":"fascinating","definition":"极有吸引力的，迷人的"}]

2
00:00:05.000 --> 00:00:08.200
Let's master it step by step.
让我们一步一步掌握它。
`;

  it('correctly parses bilingual VTT cues with vocab and timestamps', () => {
    const cues = parseBilingualVtt(sampleVtt);
    expect(cues).toHaveLength(2);

    expect(cues[0].start).toBe(1000);
    expect(cues[0].end).toBe(4500);
    expect(cues[0].text).toBe('The English language is fascinating.');
    expect(cues[0].translation).toBe('英语这门语言非常迷人。');
    expect(cues[0].vocab).toEqual([{ word: 'fascinating', definition: '极有吸引力的，迷人的' }]);

    expect(cues[1].start).toBe(5000);
    expect(cues[1].end).toBe(8200);
    expect(cues[1].text).toBe("Let's master it step by step.");
    expect(cues[1].translation).toBe('让我们一步一步掌握它。');
  });

  it('correctly builds bilingual VTT string from cue objects', () => {
    const cues = [
      {
        start: 1000,
        end: 3500,
        text: 'Hello world',
        translation: '你好世界',
        vocab: [{ word: 'world', definition: '世界' }],
      },
    ];

    const built = buildBilingualVtt(cues);
    expect(built).toContain('WEBVTT');
    expect(built).toContain('00:00:01.000 --> 00:00:03.500');
    expect(built).toContain('Hello world');
    expect(built).toContain('你好世界');
    expect(built).toContain('Words: [{"word":"world","definition":"世界"}]');
  });

  it('handles empty input gracefully', () => {
    expect(parseBilingualVtt('')).toEqual([]);
    expect(buildBilingualVtt([])).toBe('WEBVTT');
    expect(buildBilingualVtt(null)).toBe('WEBVTT');
  });
});
