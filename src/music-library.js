// LunaWave music library: the tracks supplied with the project (public/music). Nothing here is invented:
//  - titles come from the supplied file names
//  - composer credits come from the supplied file names / the supplied "Credit" image (track 3: "@tayonese")
//  - artwork is the Cover image supplied in each track's own folder
// `composer` is the credit shown as "composer"; `artist` is only set when a separate performer / uploader is supplied.
export const TRACKS = [
  {
    id: 'jerseyclub', src: './music/jerseyclub.mp3', format: 'audio/mpeg', duration: 152.03,
    title: 'NO SIGNAL #jerseyclub', composer: 'Tai2Talented', artist: null, album: null, cover: './music/jerseyclub.jpg',
  },
  {
    id: 'funk', src: './music/funk.mp3', format: 'audio/mpeg', duration: 61.1,
    title: 'No Signal Funk!', composer: 'DynaCarl', artist: null, album: null, cover: './music/funk.jpg',
  },
  {
    id: 'fullversion', src: './music/fullversion.mp3', format: 'audio/mpeg', duration: 112.09,
    title: 'No Signal [Full Version]', composer: '@tayonese', artist: 'Your Ordinary ASYM Fandom', album: null, cover: './music/fullversion.jpg',
    source: 'https://vm.tiktok.com/ZN8BUGDBb/',
  },
  {
    id: 'hallway', src: './music/hallway.mp3', format: 'audio/mpeg', duration: 123.48,
    title: "You're Walking Down the Hallway", composer: 'JomJom412', artist: null, album: null, cover: './music/hallway.jpg',
  },
];
export const NO_COMPOSER = 'ไม่ระบุผู้แต่ง';
