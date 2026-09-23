# =============================================================================
# nb_materialise_posthog
# =============================================================================
# Replaces three SQL views with incrementally-maintained Delta tables:
#   v_gold_posthog_events_sfdc        -> gold_posthog_events_sfdc
#   v_silver_posthog_account_activity -> gold_posthog_account_activity
#   v_gold_posthog_user_adoption_weekly -> gold_posthog_user_adoption_weekly
#
# Schedule: nightly (e.g. 02:00) via Fabric pipeline.
# Incremental: only processes events newer than the latest date_event in
#              gold_posthog_events_sfdc. First run processes all history.
# =============================================================================

# ── Cell 1: Imports & config ─────────────────────────────────────────────────
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from datetime import date

EVENTS_SRC   = "posthog_notebook_events"
GOLD_EVENTS  = "gold_posthog_events_sfdc"
GOLD_ACTIVITY = "gold_posthog_account_activity"
GOLD_WEEKLY  = "gold_posthog_user_adoption_weekly"

# ── Cell 2: Watermark ────────────────────────────────────────────────────────
try:
    wm_row = spark.sql(f"SELECT MAX(date_event) AS wm FROM {GOLD_EVENTS}").collect()[0]
    watermark = wm_row["wm"] if wm_row["wm"] else date(2026, 1, 1)
except Exception:
    watermark = date(2026, 1, 1)

print(f"Watermark: {watermark}")

# ── Cell 3: MDM lookup (one SF account per tenant, priority deduped) ─────────
mdm_raw = spark.table("gold_mdm_posthog")

priority = (
    F.when(F.col("match_method") == "EOS Domain",     1)
     .when(F.col("match_method") == "Account Code",   2)
     .when(F.col("match_method") == "SP EOS Domain",  3)
     .when(F.col("match_method") == "Website Domain", 4)
     .when(F.col("match_method") == "ZD Domain",      5)
     .when(F.col("match_method") == "SP Companies",   6)
     .when(F.col("match_method") == "Wildcard",       7)
     .otherwise(8)
)

w_mdm = Window.partitionBy("ph_tenant").orderBy(priority, "sf_account_id")

mdm = (
    mdm_raw
    .withColumn("rn", F.row_number().over(w_mdm))
    .filter(F.col("rn") == 1)
    .select("ph_tenant", "sf_account_id", "sf_account_code", "sf_account_name")
)

# ── Cell 4: Region code → energy_market lookup ───────────────────────────────
region_rows = [
    ("gbr","Great Britain"), ("aus","Australia NEM"), ("wem","Australia WEM"),
    ("deu","Germany"),       ("bel","Belgium"),        ("ita","Italy"),
    ("nod","Nordics"),       ("dnk","Nordics"),         ("fin","Nordics"),
    ("swe","Nordics"),       ("erc","ERCOT"),           ("fra","France"),
    ("pol","Poland"),        ("ibe","Iberia"),          ("cas","CAISO"),
    ("cai","CAISO"),         ("nld","Netherlands"),     ("rou","Romania"),
    ("irx","Ireland"),       ("grc","Greece"),          ("bal","Baltics"),
    ("ind","India"),         ("bgr","Bulgaria"),        ("mis","MISO"),
    ("ny", "NYISO"),         ("hun","Hungary"),         ("pjm","PJM"),
    ("jpn","Japan"),         ("alb","Alberta"),         ("mex","Mexico"),
    ("kor","South Korea"),   ("twn","Taiwan"),          ("phi","Philippines"),
    ("chl","Chile"),         ("spp","SPP"),             ("aut","Austria"),
    ("isn","ISO-NE"),
]
region_df = spark.createDataFrame(region_rows, ["code", "energy_market"])

# ── Cell 5: Tenant format classifier ─────────────────────────────────────────
def tenant_format(t):
    if t is None:
        return None
    if len(t) == 36 and t[8] == '-' and t[13] == '-' and t[18] == '-' and t[23] == '-':
        return "uuid"
    if len(t) == 5 and t.isalpha():
        return "code"
    if '.' in t:
        return "domain"
    return "other"

tenant_format_udf = F.udf(tenant_format)

# ── Cell 6: Read new events (incremental) ────────────────────────────────────
new_events = spark.sql(f"""
    SELECT * FROM {EVENTS_SRC}
    WHERE date_event > '{watermark}'
""")

count_new = new_events.count()
print(f"New events to process: {count_new:,}")

# ── Cell 7: Enrich with SFDC + region context ────────────────────────────────
enriched = (
    new_events
    .join(mdm, F.lower(F.trim(new_events.tenant)) == F.col("ph_tenant"), "left")
    .join(region_df, F.lower(new_events.region) == region_df.code, "left")
    .withColumn(
        "sfdc_market_key",
        F.when(
            F.col("sf_account_code").isNotNull() & F.col("energy_market").isNotNull(),
            F.concat(F.col("sf_account_code"), F.lit("|"), F.col("energy_market"))
        )
    )
    .withColumn("ph_tenant_format", tenant_format_udf(F.col("tenant")))
    .drop("ph_tenant", "code")
)

if count_new > 0:
    enriched.write.format("delta").mode("append").saveAsTable(GOLD_EVENTS)
    print(f"Appended {count_new:,} rows to {GOLD_EVENTS}")
else:
    print("No new events — skipping append")

# ── Cell 8: Recompute gold_posthog_account_activity (full overwrite) ─────────
# Reads from the full gold events table (already materialized — fast Delta read)

gold_events = spark.table(GOLD_EVENTS).filter(
    (F.col("tenant").isNotNull()) &
    (F.trim(F.col("tenant")) != "") &
    (F.col("event") == "url_state_change")
)

# Engagement minutes: sum of capped intra-session gaps (30-min cap)
session_w = Window.partitionBy("tenant", "session_id").orderBy("timestamp")
gaps = (
    gold_events
    .withColumn("prev_ts", F.lag("timestamp").over(session_w))
    .withColumn("gap_s", F.unix_timestamp("timestamp") - F.unix_timestamp("prev_ts"))
    .withColumn("gap_capped", F.least(F.col("gap_s"), F.lit(1800)).cast("long"))
)

top_feature_w = Window.partitionBy("tenant").orderBy(F.desc("feat_cnt"))
top_region_w  = Window.partitionBy("tenant").orderBy(F.desc("reg_cnt"))
top_currency_w = Window.partitionBy("tenant").orderBy(F.desc("cur_cnt"))

activity = (
    gold_events
    .groupBy("tenant")
    .agg(
        F.count("*").alias("ph_total_events"),
        F.countDistinct("person_id").alias("ph_distinct_users"),
        F.countDistinct("session_id").alias("ph_distinct_sessions"),
        F.countDistinct("region").alias("ph_distinct_regions"),
        F.countDistinct(
            F.when(F.col("sensitivity").isNotNull() & (F.col("sensitivity") != ""), F.col("sensitivity"))
        ).alias("ph_distinct_sensitivities"),
        F.countDistinct(
            F.when(F.col("currency").isNotNull() & (F.col("currency") != ""), F.col("currency"))
        ).alias("ph_distinct_currencies"),
        F.countDistinct(
            F.when(F.col("scenario").isNotNull() & (F.col("scenario") != ""), F.col("scenario"))
        ).alias("ph_distinct_scenarios"),
        F.countDistinct(
            F.when(F.col("ic").isNotNull() & (F.col("ic") != ""), F.col("ic"))
        ).alias("ph_distinct_ics"),
        F.max("timestamp").alias("ph_last_seen"),
        F.min("timestamp").alias("ph_first_seen"),
    )
)

# Top feature per tenant
feat_counts = gold_events.filter(F.col("feature").isNotNull() & (F.col("feature") != "")) \
    .groupBy("tenant","feature").agg(F.count("*").alias("feat_cnt"))
top_feat = feat_counts.withColumn("rn", F.row_number().over(top_feature_w)).filter("rn=1") \
    .select("tenant", F.col("feature").alias("ph_top_feature"))

# Top 3 regions per tenant
reg_counts = gold_events.filter(F.col("region").isNotNull() & (F.col("region") != "")) \
    .groupBy("tenant","region").agg(F.count("*").alias("reg_cnt"))
top_reg3 = reg_counts.withColumn("rn", F.row_number().over(top_region_w)).filter("rn<=3") \
    .groupBy("tenant").agg(F.concat_ws(", ", F.collect_list("region")).alias("ph_top_regions"))

# Top currency per tenant
cur_counts = gold_events.filter(F.col("currency").isNotNull() & (F.col("currency") != "")) \
    .groupBy("tenant","currency").agg(F.count("*").alias("cur_cnt"))
top_cur = cur_counts.withColumn("rn", F.row_number().over(top_currency_w)).filter("rn=1") \
    .select("tenant", F.col("currency").alias("ph_top_currency"))

# Non-central sensitivity flag
non_central = gold_events.groupBy("tenant").agg(
    F.max(F.when(
        F.col("sensitivity").isNotNull() & ~F.lower(F.col("sensitivity")).isin("central",""),
        F.lit(1)
    ).otherwise(F.lit(0))).alias("ph_uses_non_central")
)

# Engaged minutes from capped gaps
engaged = gaps.groupBy("tenant").agg(
    (F.sum("gap_capped") / 60).alias("ph_engaged_minutes")
)

account_activity = (
    activity
    .join(top_feat, "tenant", "left")
    .join(top_reg3,  "tenant", "left")
    .join(top_cur,   "tenant", "left")
    .join(non_central, "tenant", "left")
    .join(engaged,   "tenant", "left")
)

account_activity.write.format("delta").mode("overwrite").saveAsTable(GOLD_ACTIVITY)
print(f"Wrote {account_activity.count():,} rows to {GOLD_ACTIVITY}")

# ── Cell 9: Recompute gold_posthog_user_adoption_weekly ──────────────────────
# Rolling 13-week window. Reads from gold_events (fast Delta read, no joins).
# Pivot columns are generated dynamically so no view SQL needs updating.

from datetime import timedelta

def last_monday(d):
    return d - timedelta(days=d.weekday())

today = date.today()
week_start = last_monday(today)
weeks = [(week_start - timedelta(weeks=i)) for i in range(12, -1, -1)]  # 13 weeks oldest→newest

features = {"benchmarks": "bm", "investment-cases": "ic", "leaderboards": "lb"}

filtered = spark.table(GOLD_EVENTS).filter(
    (F.col("event") == "url_state_change") &
    F.col("feature").isin(list(features.keys())) &
    F.col("person_id").isNotNull() &
    (F.trim(F.col("person_id").cast("string")) != "") &
    F.col("session_id").isNotNull() &
    (F.col("timestamp") >= str(weeks[0]))
)

agg_exprs = [F.col("person_id"), F.col("sf_account_id"), F.col("sf_account_code"), F.col("sf_account_name")]

for feat_name, prefix in features.items():
    for i, w_start in enumerate(weeks):
        w_end = w_start + timedelta(weeks=1)
        col_name = f"{prefix}_{w_start.strftime('%Y_%m_%d')}"
        agg_exprs.append(
            F.countDistinct(
                F.when(
                    (F.col("feature") == feat_name) &
                    (F.col("timestamp") >= str(w_start)) &
                    (F.col("timestamp") < str(w_end)),
                    F.col("session_id")
                )
            ).alias(col_name)
        )

weekly = filtered.groupBy("person_id","sf_account_id","sf_account_code","sf_account_name").agg(
    *[e for e in agg_exprs[4:]]
)

weekly.write.format("delta").mode("overwrite").saveAsTable(GOLD_WEEKLY)
print(f"Wrote {weekly.count():,} rows to {GOLD_WEEKLY}")

# ── Cell 10: Drop the old views ───────────────────────────────────────────────
for view in [
    "v_gold_posthog_events_sfdc",
    "v_silver_posthog_account_activity",
    "v_gold_posthog_user_adoption_weekly",
]:
    try:
        spark.sql(f"DROP VIEW IF EXISTS {view}")
        print(f"Dropped view: {view}")
    except Exception as e:
        print(f"Could not drop {view}: {e}")

print("Done.")
