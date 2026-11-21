# Emotion photos vs SmartSpectra

File name: `{expected}_{sdk_response}_{match}.jpg`. `sdk_response` is the top expression the SDK reported, `match` is whether it equals `expected`.
Checked with `apps/server/scripts/photo-expression.ts`: the photo is streamed at 30 fps until the first `expression` arrives (about 2 s).

Source: [Images of Compound Affect (IsCA)](https://reshare.ukdataservice.ac.uk/855077/), UK Data Service ReShare, open access, one posing person, FACS codes coded by the author alone.
The licence field on the source page is empty, so check the terms there before redistributing the photos.

`expected` comes from the intended emotion in the source metadata. Compounds where the upper and lower face show unrelated emotions are not saved, and no neutral face exists in the source.

| File | IsCA image | FACS | Note |
|---|---|---|---|
| `angry_disgust_false.jpg` | #030 | 23+25+26+29 | mouth only |
| `disgust_disgust_true.jpg` | #031 | 10+16+25 | mouth only |
| `happy_contempt_false.jpg` | #032 | 12 | mouth only; source notes error +17+L14 |
| `sad_sad_true.jpg` | #033 | 15 | mouth only |
| `fear_neutral_false.jpg` | #034 | 20+21+25 | mouth only |
| `surprise_surprise_true.jpg` | #035 | 25+26 | mouth only |
| `angry_angry_true.jpg` | #036 | 4+5+7 | brows/eyes only |
| `disgust_angry_false.jpg` | #037 | 9+17 | brows/eyes only |
| `surprise_surprise_true_2.jpg` | #038 | 1+2 | brows/eyes only |
| `fear_surprise_false.jpg` | #039 | 1+2+4+5+7 | brows/eyes only |
| `sad_sad_true_2.jpg` | #040 | 1+4 | brows/eyes only |
| `happy_neutral_false.jpg` | #041 | 6 | brows/eyes only |
| `angry_angry_true_2.jpg` | #094 | 4+5+7+23+25+26+29 | full face; source notes error +10 |
| `happy_happy_true.jpg` | #098 | 6+12+25+26 | full face |
| `fear_fear_true.jpg` | #114 | 1+2+4+5+7+20+21+25 | full face |
| `fear_fear_true_2.jpg` | #117 | 1+2+4+5+7+20+21+25 | full face |
| `fear_fear_true_3.jpg` | #119 | 1+2+4+5+7+20+21+25 | full face |
| `disgust_angry_false_2.jpg` | #096 | 9+10+16+25+26 | full face |
| `disgust_disgust_true_2.jpg` | #024 | 9+25+26 | full face |
| `contempt_contempt_true.jpg` | #151 | 4+5+7+R14 | full face; lower face is contempt, upper is anger |
| `contempt_contempt_true_2.jpg` | #153 | 12+R14 | full face; neutral upper, lower is happiness + contempt |
| `sad_sad_true_3.jpg` | #122 | 1+4+6+15 | full face |
| `sad_sad_true_4.jpg` | #129 | 1+2+4+15 | full face |
| `sad_fear_false.jpg` | #107 | 1+4+5+7+15 | full face; anger brows |
| `surprise_surprise_true_3.jpg` | #128 | 1+2+6+25+26 | full face |
| `surprise_fear_false.jpg` | #130 | 1+2+4+25+26 | full face |
| `surprise_angry_false.jpg` | #126 | 1+2+9+25+26 | full face; nose wrinkle |
| `disgust_angry_false_3.jpg` | #108 | 1+2+9+10+16+25 | full face |
| `disgust_angry_false_4.jpg` | #109 | 6+9+10+16+25 | full face |
| `disgust_angry_false_5.jpg` | #125 | 1+2+9+10+16+25 | full face |
