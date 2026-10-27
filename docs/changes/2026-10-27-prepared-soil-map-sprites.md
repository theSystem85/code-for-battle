# Bugfix: Rebuild prepared soil map sprites after lake tags

- [x] **Regenerate prepared `dtv6_decor_soil` tiers so Netlify `dev` builds pass**
  The soil puddle lake-tag change updated the source sheet metadata but left `public/images/prepared-map-sprites/` stale. `check:map-sprite-tiers` then failed every branch deploy after `68a4e506`.
  Spec: none
