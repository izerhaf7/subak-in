"""Daily -> weekly aggregation (shared by forecast.py and supply.py) plus an STL
decomposition used as a diagnostic: does the harvest cycle actually show up as
a ~52-week seasonal component in the raw price series? This is a sanity check
on the harvest-kernel assumptions in supply.py, not an input the forecast
itself depends on - Holt-Winters (forecast.py) fits its own seasonal term.
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
