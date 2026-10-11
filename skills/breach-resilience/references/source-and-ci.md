# ソース管理の token・CI・self-hosted runner（2026-10 時点で実測）

- **無料プランの private repo は branch protection が効かない**。有料にしても、手元の token が `repo`（管理者）範囲なら保護を API で外せる。有料化は fine-grained token（管理・workflow 権限なし）とセットの時だけ効く。
- **`workflow` 範囲の token は CI のファイルを書き換えられる** = CI の secret を外へ送れる。普段は外し、workflow を直す時だけ付けて、終わったら外す。
- **CI に本番 DB の強い鍵・基盤の管理 token を置かない**。RLS の試験は schema の snapshot を流した使い捨ての Postgres で回す。集計が要る夜間ジョブには、集計関数だけを実行できる専用ロールを作る。
- **`repo` 範囲の token は self-hosted runner を登録できる**。毎週、全 repo の runner 名を前回値と比べる。
- **self-hosted runner を本人と同じ OS user で動かさない**: CI の job が本人の home（手元の鍵・token・台帳）を読める。runner 専用の user に分け、本人の home を 700 にし、runner の user から読めないことを陰性で確かめる。
- **runner を置いた repo は public にしない・fork の PR を受けない**（他人のコードが自分の機械で走る）。
- **本番へ出す版の見張り**: 昇格の script が通した版を、本人の home の台帳に push の前に書く。毎時、本番の version と突き合わせ、台帳に無い版が本番にあれば通知する。runner からは台帳が読めないので、token だけでは台帳を書き換えられない。
- **使わない機械の登録を残さない**: offline の runner も、その機械が起動すれば secret 付きの job を拾う。使わない機械には runner・鍵を置かない。
