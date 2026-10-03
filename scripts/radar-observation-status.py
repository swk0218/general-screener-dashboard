"""Derived-only daily transport status. Never model input, signal or raw publication."""
import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler

import exchange_calendars as xc
import pandas as pd

URL = 'https://raw.githubusercontent.com/whit3rabbit/fear-greed-data/main/json/cnn_output.json'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise ValueError('UNREVIEWED_REDIRECT')


def duplicate_keys(pairs):
    result = {}
    for key,value in pairs:
        if key in result: raise ValueError('DUPLICATE_JSON_KEY')
        result[key] = value
    return result


def parse_daily(raw):
    body = json.loads(raw,object_pairs_hook=duplicate_keys,
                      parse_constant=lambda value:(_ for _ in ()).throw(ValueError('NONFINITE_JSON')))
    daily = {}
    for point in body['fear_and_greed_historical']['data']:
        x,value = point['x'],point['y']
        if isinstance(x,bool) or not isinstance(x,(float,int)) or not math.isfinite(x):
            raise ValueError('INVALID_TIMESTAMP')
        stamp = pd.Timestamp(x,unit='ms',tz='UTC')
        if stamp != stamp.normalize(): continue  # Late updates never substitute daily labels.
        if isinstance(value,bool) or not isinstance(value,(float,int)) or not math.isfinite(value) or not 0<=value<=100:
            raise ValueError('INVALID_DAILY_VALUE')
        day = stamp.strftime('%Y-%m-%d')
        if day in daily and daily[day] != value: raise ValueError('CONFLICTING_DAILY_LABEL')
        daily[day] = value
    timestamp = pd.Timestamp(body['fear_and_greed']['timestamp'])
    if timestamp.tzinfo is None: raise ValueError('TIMEZONE_REQUIRED')
    return daily,timestamp.tz_convert('UTC')


def report(raw=None, *, now=None, received=None, failure=None):
    now = pd.Timestamp.now(tz='UTC') if now is None else pd.Timestamp(now)
    cal = xc.get_calendar('XNYS')
    sessions = cal.sessions_in_range((now-pd.Timedelta(days=14)).date(),now.date())
    completed = [s for s in sessions if cal.session_close(s)<=now]
    expected = completed[-1]
    close = cal.session_close(expected)
    next_open = cal.session_open(cal.next_session(expected))
    next_tick = now.normalize()+pd.Timedelta(hours=10)
    if next_tick<=now: next_tick+=pd.Timedelta(days=1)
    while not cal.is_session((next_tick-pd.Timedelta(days=1)).date()):
        next_tick+=pd.Timedelta(days=1)
    result = {'schema_version':'radar_observation_status_v1','mode':'OBSERVATION_BETA',
        'decision':'NO_SIGNAL','evidence_ready':False,'events':{'bottom':False,'top':False},
        'model_score':None,'expected_session':expected.strftime('%Y-%m-%d'),
        'source_session':None,'market_close_utc':close.isoformat(),'source_market_close_utc':None,'next_open_utc':next_open.isoformat(),
        'provider_updated_at_utc':None,'first_seen_at_utc':None,'received_at_utc':None,'source_snapshot_sha256':None,'computed_at_utc':now.isoformat(),
        'built_at_utc':None,'published_at_utc':None,'next_scheduled_at_utc':next_tick.isoformat(),
        'close90_eligible':False,'next_open_collection_eligible':False,'source_to_receipt_seconds':None,
        'collection_policy':'next_open_observation_only','model_policy':'close90_v1_unchanged',
        'source':'PUBLIC_ARCHIVE_THIRD_PARTY_CANONICAL_DAILY','status':'UNAVAILABLE',
        'failure':failure,'build_sha':os.environ.get('GITHUB_SHA','local'),
        'build_run_id':os.environ.get('GITHUB_RUN_ID'),'historical_first_seen_claimed':False}
    if raw is not None:
        daily,provider = parse_daily(raw)
        received = now if received is None else pd.Timestamp(received)
        if provider>received: raise ValueError('FUTURE_PROVIDER_TIMESTAMP')
        source_day = provider.tz_convert('America/New_York').strftime('%Y-%m-%d')
        if source_day not in daily or not cal.is_session(source_day):
            raise ValueError('MISSING_MATCHING_CANONICAL_DAILY')
        # Do not shift a prior value into the expected session or publish any raw number.
        source_close = cal.session_close(pd.Timestamp(source_day))
        source_open = cal.session_open(cal.next_session(pd.Timestamp(source_day)))
        if source_close>received: raise ValueError('SESSION_NOT_CLOSED')
        result.update(source_session=source_day,provider_updated_at_utc=provider.isoformat(),
            first_seen_at_utc=received.isoformat(),received_at_utc=received.isoformat(),
            source_snapshot_sha256=hashlib.sha256(raw).hexdigest(),source_market_close_utc=source_close.isoformat(),
            source_to_receipt_seconds=(received-source_close).total_seconds(),
            close90_eligible=received<=source_close+pd.Timedelta(minutes=90),
            next_open_collection_eligible=source_day==result['expected_session'] and received<source_open,
            status='OBSERVED_NO_SIGNAL' if source_day==result['expected_session'] and now<source_open else 'STALE')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True)
    parser.add_argument('--raw-private',help='Private backend only: retain exact raw bytes under hash filename')
    parser.add_argument('--previous-url',help='Previously published derived status only, not market data fallback')
    args = parser.parse_args()
    raw = None; received = None; failure = None
    try:
        request = Request(URL,headers={'User-Agent':'MarketRadar-observation-beta/1.0','Accept':'application/json'})
        with build_opener(NoRedirect()).open(request,timeout=15) as response:
            raw = response.read(2_000_001)
        received = pd.Timestamp.now(tz='UTC')
        if len(raw)>2_000_000: raise ValueError('PAYLOAD_BUDGET')
        result = report(raw,received=received)
    except Exception as error:
        failure = type(error).__name__  # No URL, body, credentials or provider error dump.
        result = report(failure=failure)
    if args.previous_url:
        try:
            with build_opener(NoRedirect()).open(Request(args.previous_url,
                    headers={'User-Agent':'MarketRadar-observation-beta/1.0'}),timeout=15) as response:
                previous = json.loads(response.read(20000))
            if previous.get('schema_version')=='radar_observation_status_v1':
                if (result['source_snapshot_sha256'] and result['source_snapshot_sha256']==previous.get('source_snapshot_sha256')
                        and previous.get('first_seen_at_utc')):
                    prior = pd.Timestamp(previous['first_seen_at_utc'])
                    if prior.tzinfo and prior<=pd.Timestamp(result['first_seen_at_utc']):
                        result['first_seen_at_utc']=prior.isoformat()
                elif result['status']=='UNAVAILABLE':
                    result['last_successful_observation']={key:previous.get(key) for key in
                        ('source_session','first_seen_at_utc','received_at_utc','computed_at_utc')}
        except Exception:
            pass  # No source substitution; unavailable prior metadata is explicitly absent.
    if args.raw_private and raw is not None:
        folder = Path(args.raw_private); folder.mkdir(parents=True,exist_ok=True)
        digest = hashlib.sha256(raw).hexdigest()
        path = folder/(digest+'.json')
        if not path.exists(): path.write_bytes(raw)
        receipt = folder/('receipt-'+received.strftime('%Y%m%dT%H%M%S%fZ')+'.json')
        first_seen=received.isoformat()
        for prior in folder.glob('receipt-*.json'):
            saved=json.loads(prior.read_text())
            if saved.get('sha256')==digest:first_seen=min(first_seen,saved['actual_first_seen_utc'])
        if result['first_seen_at_utc'] is not None:result['first_seen_at_utc']=first_seen
        receipt.write_text(json.dumps({'origin':URL,'sha256':digest,'actual_first_seen_utc':first_seen,
                                      'actual_received_at_utc':received.isoformat(),
                                      'status':result['status']},indent=2),encoding='utf-8')
    Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    Path(args.output).write_text(json.dumps(result,indent=2,allow_nan=False),encoding='utf-8')
    print('OBSERVATION_STATUS '+result['status']+' NO_SIGNAL')


if __name__=='__main__': main()
