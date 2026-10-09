import github from './assets/link-github.png';
import discord from './assets/link-discord.png';
import youtube from './assets/link-youtube.png';
import fun from './assets/link-fun.png';

// 32x32 Windows 3.1-style renderings of each brand mark (scripts/make-desktop-icons.ts).
const marks:Record<string,string>={github,discord,youtube,fun};
const links=[
 {kind:'fun',label:'By Fun Inc',href:'https://fun.inc',title:'Made by Fun.inc'},
 {kind:'discord',label:'Discord',href:'https://discord.gg/qYBbGmwBhr',title:'Join the Discord'},
 {kind:'github',label:'GitHub',href:'https://github.com/turtlesoupy/celeryman-os',title:'Source code on GitHub'},
 {kind:'youtube',label:'Original',href:'https://www.youtube.com/watch?v=maAFcEU6atk',title:'Watch the original Celery Man sketch on YouTube'},
];
/** Desktop shortcuts shown with the identity chooser and hidden once a session starts. */
export function installDesktopLinks(desktop:HTMLElement){
 const nav=document.createElement('nav');nav.className='desktop-links';nav.setAttribute('aria-label','Links');
 for(const link of links){
  const a=document.createElement('a');a.className='desktop-link';a.href=link.href;a.target='_blank';a.rel='noopener noreferrer';a.title=link.title;
  const icon=new Image(32,32);icon.src=marks[link.kind];icon.alt='';a.append(icon);const label=document.createElement('span');label.textContent=link.label;a.append(label);nav.append(a);
 }
 desktop.append(nav);
}
