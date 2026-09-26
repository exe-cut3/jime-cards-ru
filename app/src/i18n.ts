// UI labels. Game terms follow the official Hobby World terminology (see glossary.md).
import type { Kind, StatKey } from './types';

export const KIND_LABEL: Record<Kind, string> = {
  hero: 'Герои',
  skill: 'Навыки',
  item: 'Снаряжение',
  terrain: 'Местность',
  damage: 'Урон',
  fear: 'Страх',
  condition: 'Преимущества и напасти',
};

export const KIND_ORDER: Kind[] = ['hero', 'skill', 'item', 'terrain', 'damage', 'fear', 'condition'];

export const SUBTYPE_LABEL: Record<string, string> = {
  Hero: 'Навык героя',
  Role: 'Навык роли',
  Basic: 'Базовая',
  Title: 'Прозвище',
  Weakness: 'Слабость',
  Weapon: 'Оружие',
  Support: 'В руки',
  Trinket: 'Вещь',
  Armor: 'Броня',
  Mount: 'Верховое животное',
  boon: 'Преимущество',
  bane: 'Напасть',
};

export const STAT_LABEL: Record<StatKey, string> = {
  might: 'Сила',
  wisdom: 'Мудрость',
  agility: 'Ловкость',
  spirit: 'Храбрость',
  wit: 'Смекалка',
};

export const STAT_KEYS: StatKey[] = ['might', 'wisdom', 'agility', 'spirit', 'wit'];

export const TRAIT_LABEL: Record<string, string> = {
  Aid: 'Помощь',
  Creature: 'Существо',
  Food: 'Еда',
  Innate: 'Врождённый',
  Knowledge: 'Знания',
  Shadow: 'Тень',
  Song: 'Песня',
  Tactic: 'Тактика',
  Valour: 'Доблесть',
  Wild: 'Любая характеристика',
};

// Hero and role names as printed in the Hobby World edition.
export const OWNER_LABEL: Record<string, string> = {
  Aragorn: 'Арагорн', Arwen: 'Арвен', Balin: 'Балин', Beorn: 'Беорн', Beravor: 'Беравор', Bilbo: 'Бильбо',
  Boromir: 'Боромир', 'Calaminth Took': 'Каламинта Тук', Dis: 'Дис', Dwalin: 'Двалин', Eleanor: 'Элеанор',
  Elena: 'Елена', 'Fréahild': 'Фреахильда', Gandalf: 'Гэндальф', Gimli: 'Гимли', Legolas: 'Леголас',
  'Rénëríen': 'Ренириэн', 'The Great Bear': 'Большой Медведь',
  Burglar: 'Взломщик', Captain: 'Лидер', Guardian: 'Защитник', Hunter: 'Охотник', Musician: 'Музыкант',
  Pathfinder: 'Следопыт', Herbalist: 'Травник', Delver: 'Рудовед', Traveller: 'Путник', Smith: 'Кузнец',
  Meddler: 'Смутьян', Lorekeeper: 'Книжник', Guide: 'Проводник', Shieldmaiden: 'Воительница',
  Provisioner: 'Снабженец', Soldier: 'Солдат', Trickster: 'Ловкач', 'Beast-Friend': 'Друг зверей',
  Basic: 'Базовая', Title: 'Прозвище', Weakness: 'Слабость',
};

export const STAT_LABEL_EN: Record<string, string> = { Might: 'Сила', Wisdom: 'Мудрость', Agility: 'Ловкость', Spirit: 'Храбрость', Wit: 'Смекалка' };

export const ICON_LABEL: Record<string, string> = {
  success: 'Успех',
  fate: 'Судьба',
  fear: 'Страх',
  damage: 'Урон',
  inspiration: 'Воодушевление',
  lore: 'Сведения',
  might: 'Сила',
  wisdom: 'Мудрость',
  agility: 'Ловкость',
  spirit: 'Храбрость',
  wit: 'Смекалка',
};

// Expansion codes -> official Russian titles (Hobby World).
export const EXPANSION_LABEL: Record<string, string> = {
  core: 'Базовая игра',
  sp: 'Тёмные тропы',
  sw: 'Ветер войны',
  did: 'Обитатели тьмы',
  voe: 'Злодеи Эриадора',
  sotw: 'Бич пустошей',
};

export const EXPANSION_SHORT: Record<string, string> = {
  core: 'База',
  sp: 'ТТ',
  sw: 'ВВ',
  did: 'ОТ',
  voe: 'ЗЭ',
  sotw: 'БП',
};

export const UI = {
  title: 'Странствия в Средиземье',
  subtitle: 'база карт',
  search: 'Поиск по названию и тексту',
  filters: 'Фильтры',
  reset: 'Сбросить',
  bookmarks: 'Закладки',
  viewCards: 'Карты',
  viewDeck: 'Колода',
  offline: 'офлайн',
  show: (n: number) => `Показать ${n} ${plural(n, 'карту', 'карты', 'карт')}`,
  prev: 'Предыдущая карта',
  next: 'Следующая карта',
  zoom: 'Открыть скан во весь экран',
  all: 'Все',
  section: 'Раздел',
  skillType: 'Тип навыка',
  itemType: 'Тип предмета',
  hero: 'Герой',
  role: 'Роль',
  expansion: 'Дополнение',
  cost: 'Стоимость (очки опыта)',
  starting: 'стартовая',
  icons: 'Символы',
  traits: 'Атрибуты',
  tier: 'Ранг',
  test: 'Характеристика',
  nothing: 'Ничего не найдено',
  found: (n: number) => `${n} ${plural(n, 'карта', 'карты', 'карт')}`,
  close: 'Закрыть',
  copyLink: 'Скопировать ссылку',
  copied: 'Скопировано',
  bookmark: 'В закладки',
  unbookmark: 'Убрать из закладок',
  front: 'Лицо',
  back: 'Оборот',
  scanRu: 'Русский скан',
  scanEn: 'Английский скан',
  noRu: 'перевод пока не сделан',
  ocrNote: 'текст распознан со скана и ещё не вычитан',
  proofreadNote: 'текст со скана русского издания, вычитан по английскому оригиналу',
  background: 'Предыстория',
  suggested: 'Рекомендуемый выбор',
  number: '№',
  lore: 'Показатель сведений',
  copies: 'копий',
  disclaimer:
    'Неофициальный фанатский проект. Игровые материалы © Fantasy Flight Games. Middle-earth и The Lord of the Rings — товарные знаки Saul Zaentz Company. Русское издание — Hobby World.',
};

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
