"""Daily -> weekly aggregation (shared by forecast.py and supply.py) plus STL
decomposition utilities.

STL is used in two ways:
1. Diagnostic: does the harvest cycle actually show up as a ~52-week seasonal
   component in the raw price series? (original use)
2. Supply-timing anchor: find_harvest_peak_week() extracts the ISO week-of-year
   where the STL seasonal component is lowest (price trough). That week is the
   best data-driven estimate of WHEN harvest gluts actually hit the market for a
   given kabupaten × komoditas pair — more reliable than hardcoded agronomic
   CYCLES_PER_YEAR assumptions. Used by supply.py to anchor harvest_convolution()
   to the real calendar rather than assuming peak supply = "now".
"""
import pandas as pd
from statsmodels.tsa.seasonal import STL

WEEKLY_FREQ = "W-MON"


def to_weekly(daily_df: pd.DataFrame, group_cols: list, date_col: str = "date",
              value_col: str = "nominal_price") -> pd.DataFrame:
    """Resample a daily (date, *group_cols, value_col) frame to weekly mean."""
    df = daily_df.copy()
    df = df.set_index(date_col)
    weekly = (
        df.groupby(group_cols)[value_col]
        .resample(WEEKLY_FREQ)
        .mean()
        .reset_index()
    )
    return weekly


def iso_week_label(ts: pd.Timestamp) -> str:
    iso = ts.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def stl_decompose(weekly_series: pd.Series, period: int = 52):
    """weekly_series: pd.Series indexed by weekly date, no gaps (caller must
    reindex/interpolate first). Returns statsmodels DecomposeResult, or None if
    there isn't enough history for two full seasonal cycles."""
    s = weekly_series.dropna()
    if len(s) < period * 2:
        return None
    return STL(s, period=period, robust=True).fit()


def seasonal_amplitude(weekly_series: pd.Series, period: int = 52) -> float:
    """Peak-to-trough range of the STL seasonal component, as a fraction of the
    series mean - a quick check that harvest cycles produce a real price swing
    (used for a printed sanity check in forecast.py's backtest report, not
    consumed by the forecast model itself)."""
    result = stl_decompose(weekly_series, period=period)
    if result is None:
        return float("nan")
    seasonal = result.seasonal
    mean = weekly_series.mean()
    if mean == 0 or pd.isna(mean):
        return float("nan")
    return float((seasonal.max() - seasonal.min()) / mean)


def find_harvest_peak_week(weekly_series: pd.Series, period: int = 52) -> int | None:
    """Returns the ISO week-of-year (1-52) where the STL seasonal component is
    at its MINIMUM — i.e. the week when prices are historically depressed by
    seasonal harvest gluts. This is used as an anchor for supply.py's
    harvest_convolution() so the model's supply peak falls in the same calendar
    week that real prices historically hit their seasonal trough.

    Returns None if there's insufficient history for STL (< 2 full years).
    The caller should handle None by falling back to a provincial default.

    Note: takes the AVERAGE seasonal component per week-of-year across all years
    in the series, so a single anomalous year doesn't dominate the result."""
    result = stl_decompose(weekly_series, period=period)
    if result is None:
        return None
    seasonal = result.seasonal
    seasonal_index = pd.Series(
        seasonal.values,
        index=pd.to_datetime(seasonal.index)
    )
    by_week = seasonal_index.groupby(seasonal_index.index.isocalendar().week).mean()
    return int(by_week.idxmin())
