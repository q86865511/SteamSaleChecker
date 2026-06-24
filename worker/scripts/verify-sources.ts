import { fetchFeatured, fetchAppDetails } from '../src/sources/steam';
const main = async () => {
  const { specials, topSellers } = await fetchFeatured();
  console.log('specials:', specials.length, 'topSellers:', topSellers.length);
  console.log('sample special:', specials[0]);
  const sample = specials[0]?.appid ?? 413150;
  const d = await fetchAppDetails(sample);
  console.log('appdetails sample (台幣?):', d);
};
main().catch(e => { console.error(e); process.exit(1); });
