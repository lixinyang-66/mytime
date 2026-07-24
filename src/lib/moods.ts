export const MOODS = [
  { key: 'annoyed', label: '被惹到了', src: '/moods/annoyed.jpg' },
  { key: 'celebration', label: '大胜狂欢', src: '/moods/celebration.jpg' },
  { key: 'unlucky', label: '倒霉得很', src: '/moods/unlucky.jpg' },
  { key: 'fighting', label: '奋斗中', src: '/moods/fighting.jpg' },
  { key: 'zen', label: '佛系（无事发生）', src: '/moods/zen.jpg' },
  { key: 'grateful', label: '感恩的心', src: '/moods/grateful.jpg' },
  { key: 'thumbs-up', label: '给自己大拇哥', src: '/moods/thumbs-up.jpg' },
  { key: 'cool', label: '今天很 cool', src: '/moods/cool.jpg' },
  { key: 'whatever', label: '就这', src: '/moods/whatever.jpg' },
  { key: 'happy', label: '开心耶', src: '/moods/happy.jpg' },
  { key: 'hopeful', label: '期待好事发生', src: '/moods/hopeful.jpg' },
  { key: 'melancholy', label: '问君能有几多愁', src: '/moods/melancholy.jpg' },
  { key: 'confused', label: '我不理解', src: '/moods/confused.jpg' },
  { key: 'small-win', label: '小胜即庆', src: '/moods/small-win.jpg' },
  { key: 'heartbroken', label: '心碎（不容易哄好版）', src: '/moods/heartbroken.jpg' },
  { key: 'angry', label: '严肃地生气', src: '/moods/angry.jpg' },
] as const;

export type MoodKey = (typeof MOODS)[number]['key'];

export function isMoodKey(value: string): value is MoodKey {
  return MOODS.some((mood) => mood.key === value);
}

export function getMoodByKey(key: string | null | undefined) {
  return MOODS.find((mood) => mood.key === key);
}
