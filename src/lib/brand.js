// Photos and institution marks copied from the CalCompute public site repo
// (../CalCompute/CaliforniaCompute.org/site/public). Photos: only the team that site shows, by the names it uses
// (library-wiki team pages).
const PHOTOS = {
  'Sarvani Chadalapaka': 'sarvani-chadalapaka.jpeg', 'Kevin Michael Esterling': 'kevin-michael-esterling.jpg',
  'Lili Gangas': 'lili-gangas.jpg', 'Leilani H. Gilpin': 'leilani-gilpin.jpeg', 'Ruby Guillen': 'ruby-guillen.jpeg',
  'Kim Hazelwood': 'kim-hazelwood.jpeg', 'Stephanie Lieggi': 'stephanie-lieggi.jpeg', Nelson: 'jt-nelson.jpg',
  'Anthony Suen': 'anthony-suen.png', 'Lawrence Wagner': 'lawrence-wagner.jpeg', 'Frank Würthwein': 'frank-wurthwein.jpg',
  'Elena Cryst': 'elena-cryst.webp', 'Homa Hosseinmardi': 'homa-hosseinmardi.png', 'Mark Nitzberg': 'mark-nitzberg.png',
  'Daniel Romo': 'daniel-romo.jpeg', 'Omar Aslai': 'omar-aslai.jpeg', 'Deeksha Vaidyanathan': 'deeksha-vaidyanathan.jpeg',
  'Vashishth Doshi': 'vashishth-doshi.jpeg', 'Ariya Mohanty': 'ariya-mohanty.jpeg',
};
export const PLACEHOLDER = '/images/brand/person-placeholder.svg';
export const photoFor = (name) => (PHOTOS[name] ? `/images/people/${PHOTOS[name]}` : null);

// Affiliation text -> mark. A mark only names its institution. No match, no mark.
const LOGOS = [
  [/UC Merced/, 'UCM.svg', 'UC Merced'], [/UC Riverside/, 'UCR.png', 'UC Riverside'], [/UC Santa Cruz/, 'UCSC.svg', 'UC Santa Cruz'],
  [/UC San Diego/, 'UCSD.svg', 'UC San Diego'], [/UC Berkeley/, 'UCB.svg', 'UC Berkeley'],
  [/San Diego Supercomputer Center|SDSC/, 'sdsc.svg', 'San Diego Supercomputer Center'], [/Kapor/, 'kapor-center.svg', 'Kapor Center'],
  [/Cal-ICOR/, 'Cal-ICOR.png', 'Cal-ICOR'], [/\bBASE\b/, 'BASE.jpg.webp', 'BASE'], [/CROSS/, 'CROSS.jpg', 'CROSS'],
  [/UNA-USA/, 'UNA-USA_primary_logo.svg', 'UNA-USA'], [/Empire AI/, 'empire-ai.svg', 'Empire AI'],
  [/Stanford HAI/, 'stanford-hai.svg', 'Stanford HAI'], [/Stanford(?! HAI)/, 'stanford.svg', 'Stanford University'],
  [/UCLA(?! AI)/, 'UCLA.png', 'UCLA'], [/UC Davis/, 'UCD.png', 'UC Davis'], [/UC Irvine/, 'UCI.png', 'UC Irvine'],
  [/Lawrence Berkeley National Laboratory/, 'berkeley-lab.svg', 'Berkeley Lab'], [/SVIHTS/, 'svihts.svg', 'SVIHTS'],
  [/GloCha/, 'GLOCHA.jpg', 'GloCha'], [/Atmosphere Ventures/, 'atmosphere-ventures.png', 'Atmosphere Ventures'],
  [/OASIS Lab/, 'oasis-lab.png', 'OASIS Lab'], [/UC OSPO|Open Source Program Office/, 'UCSC-OSPO.jpg', 'UC Santa Cruz OSPO'],
];
export const logosFor = (text = '') => [
  ...LOGOS.filter(([re]) => re.test(text)).map(([, file, name]) => ({ src: `/images/logos/${file}`, name })),
  ...(/,\s*CalCompute\b/.test(text) ? [{ src: '/images/brand/calcompute-icon-blue.svg', name: 'CalCompute' }] : []),
];

// Wiki institution entity page title -> mark, for graph nodes. Exact titles only.
const ENTITY_MARKS = {
  'UC Berkeley': 'UCB.svg', 'UC Berkeley College of Computing, Data Science, and Society': 'UCB.svg', 'UC Berkeley Labor Center': 'UCB.svg',
  'UC Davis': 'UCD.png', 'UC Irvine': 'UCI.png', UCLA: 'UCLA.png', 'UC San Francisco': 'UCSF.png', 'UC Riverside offices': 'UCR.png',
  'San Diego Supercomputer Center': 'sdsc.svg', 'UC San Diego Foundation': 'UCSD.svg', 'UC San Diego Jacobs School of Engineering': 'UCSD.svg',
  'Cal-ICOR': 'Cal-ICOR.png', 'Empire AI': 'empire-ai.svg', 'Stanford University': 'stanford.svg', 'Stanford HAI': 'stanford-hai.svg',
  'Lawrence Livermore National Laboratory': 'llnl.svg',
  'UC Merced': 'UCM.svg', 'UC Riverside': 'UCR.png', 'UC San Diego': 'UCSD.svg', 'UC Santa Cruz': 'UCSC.svg', 'Kapor Center': 'kapor-center.svg',
  BASE: 'BASE.jpg.webp', CROSS: 'CROSS.jpg', 'IAAI GloCha': 'GLOCHA.jpg', 'Lawrence Berkeley National Laboratory': 'berkeley-lab.svg',
  'UC OSPO Network': 'UCSC-OSPO.jpg', 'UNA-USA': 'UNA-USA_primary_logo.svg', 'Atmosphere Ventures': 'atmosphere-ventures.png',
  'Silicon Valley Institute for Humane Technology Systems': 'svihts.svg', 'San Diego State University': 'sdsu.svg',
  'University of Southern California': 'usc.svg', TechEquity: 'techequity.svg',
  'Economic Security Project': 'Economic Security CA.jpg',
  // The research institutions directory's entity pages, with the marks CaliforniaCompute.org's map uses (its
  // src/data/institutions.ts). Six have no freely licensed mark and none here.
  'California Institute of Technology': 'caltech.svg', 'UC Santa Barbara': 'UCSB.svg', 'San José State University': 'sjsu.svg',
  'Azusa Pacific University': 'azusa-pacific.svg', 'California State Polytechnic University, Pomona': 'cal-poly-pomona.svg',
  'California State University, Fresno': 'csu-fresno.svg', 'California State University, Fullerton': 'csu-fullerton.png',
  'California State University, Long Beach': 'csu-long-beach.svg', 'California State University, Los Angeles': 'csu-los-angeles.png',
  'California State University, Sacramento': 'csu-sacramento.svg', 'Chapman University': 'chapman.svg',
  'Claremont Graduate University': 'claremont-graduate.svg', 'Loyola Marymount University': 'loyola-marymount.png',
  'Pepperdine University': 'pepperdine.svg', 'San Francisco State University': 'sfsu.png', 'University of San Francisco': 'usf.svg',
  'Biola University': 'biola.png', 'California Polytechnic State University, San Luis Obispo': 'cal-poly-slo.svg',
  'California State Polytechnic University, Humboldt': 'cal-poly-humboldt.svg', 'California State University, Channel Islands': 'csu-channel-islands.svg',
  'California State University, Chico': 'csu-chico.svg', 'California State University, Dominguez Hills': 'csu-dominguez-hills.svg',
  'California State University, East Bay': 'csu-east-bay.svg', 'California State University, Monterey Bay': 'csu-monterey-bay.png',
  'California State University, Northridge': 'csu-northridge.png', 'California State University, San Bernardino': 'csu-san-bernardino.png',
  'California State University, San Marcos': 'csu-san-marcos.svg', 'Claremont McKenna College': 'claremont-mckenna.svg',
  'Harvey Mudd College': 'harvey-mudd.svg', 'Keck Graduate Institute': 'keck-graduate.png', 'Naval Postgraduate School': 'naval-postgraduate.svg',
  'Occidental College': 'occidental.svg', 'Pomona College': 'pomona-college.svg', 'Santa Clara University': 'santa-clara.png',
  'Sonoma State University': 'sonoma-state.svg', 'Western University of Health Sciences': 'western-health-sciences.svg',
  'SLAC National Accelerator Laboratory': 'slac.svg',
};
export const markForEntity = (title) => (ENTITY_MARKS[title] ? `/images/logos/${encodeURIComponent(ENTITY_MARKS[title])}` : null);
