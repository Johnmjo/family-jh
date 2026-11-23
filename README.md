# Jones Hypertrophy (JH)

A private workout logger for each family member, replacing RP Hypertrophy. Served at `johnjonesfam.com/jh` behind Cloudflare Access, with the shared family app bar.

- Mesocycles with an RIR schedule and a deload week. Next week's weights and reps come from what you logged, and sets come from your pump, workload, joint and soreness answers.
- Plates per side are calculated from the plates you own. Rest timer with a chime. Test 1RM warm-up ramp. Suggested starting weights from your history, or from similar exercises.
- 299 built-in exercises with how-to notes, 115 templates, a meso builder, copy meso, progress charts and data export.
- Everyone's training is private. Each signed-in family email gets its own space.

## Run locally

```sh
npm install
npm test
DEV_USER_EMAIL=you@example.com npm run dev   # http://localhost:8086/jh/
npm run seed                                 # optional demo data for DEV_USER_EMAIL
```

## Deploy (Unraid)

The GitHub workflow builds `ghcr.io/johnmjo/family-jh:latest` on every push to `main`. Add the container from `unraid/family-jh.xml` (port 8086, data in `/mnt/user/appdata/jh`) and fill in `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` with the same values as the other family apps. `docker-compose.yml` has the same settings.

| Variable | Default | |
| --- | --- | --- |
| `PORT` | 8086 | |
| `DATA_DIR` | /data | SQLite database `jh.db` |
| `BASE_PATH` | /jh | The app also answers at `/` |
| `HUB_URL` | https://johnjonesfam.com/ | Home button |
| `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` | | Required |
| `ALLOWED_EMAILS` | | Optional allow list |
