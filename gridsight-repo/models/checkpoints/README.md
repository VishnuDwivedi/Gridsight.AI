# models/checkpoints/best.pt — placeholder

The real trained checkpoint (~14 MB) is **not** committed to this snapshot
because hackathon repos must stay lightweight. Reproduce it locally with:

```bash
python scripts/train.py --epochs 50 --eval
```

Expected metrics on the synthetic dataset (deterministic seed 1337):

| Metric | Value |
|---|---|
| val pinball loss | ~0.082 |
| val MAPE         | ~4.7%  |
| params           | ~310k  |

Once `best.pt` exists, regenerate the browser surrogate so the dashboard
picks up the latest weights:

```bash
python scripts/distill_surrogate.py --output ../public/model_weights.json
```
