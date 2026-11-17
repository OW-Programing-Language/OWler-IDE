import {CheckCircle2,ChevronDown,ChevronRight,FlaskConical,Loader2,Play,RotateCw,XCircle} from 'lucide-react';
import {useState} from 'react';
import type {OwTestReport,OwTestResult} from '../lib/api';

type Props={
 report:OwTestReport|null;
 busy:boolean;
 command:string;
 onRunAll:()=>void;
 onRerun:()=>void;
 onNavigate:(test:OwTestResult)=>void;
};

export default function OwTestPanel({report,busy,command,onRunAll,onRerun,onNavigate}:Props){
 const [showOutput,setShowOutput]=useState(false);
 return <div className="owunit-panel">
  <div className="owunit-panel-head">
   <div className="owunit-panel-title"><FlaskConical size={16}/><strong>OWUnit</strong>
    {report&&<><span className="owunit-count passed">{report.passed} passed</span>
    <span className={'owunit-count '+(report.failed?'failed':'muted')}>{report.failed} failed</span></>}
   </div>
   <div className="owunit-panel-actions">
    <button disabled={busy} title="Run all OWUnit tests in this project" onClick={onRunAll}><Play size={13}/> Run All</button>
    <button disabled={busy||!command} title="Rerun selected tests" onClick={onRerun}><RotateCw size={13}/> Rerun</button>
   </div>
  </div>
  {busy&&<div className="owunit-execution"><Loader2 size={16} className="spin"/> Running OWUnit tests using the OW interpreter…</div>}
  {command&&<div className="owunit-command"><span>$</span> {command}</div>}
  {!report&&!busy&&<div className="owunit-empty"><FlaskConical size={25}/><p>Run your OWUnit tests</p><small>Use the green play icons beside @Test methods, run a test file, or execute the full project suite.</small></div>}
  {report&&<div className="owunit-report">
   <div className={'owunit-report-status '+(report.ok?'success':'failure')}>{report.ok?<CheckCircle2 size={16}/>:<XCircle size={16}/>}
    {report.ok?'All selected tests passed':'OWUnit reported failures'}
    <span>{report.results.length} test{report.results.length===1?'':'s'}</span>
   </div>
   <div className="owunit-result-list">
    {report.results.map((test,i)=><button key={test.file+'-'+test.name+'-'+i} title={'Open '+test.name+' in '+test.file} onClick={()=>onNavigate(test)}>
     {test.passed?<CheckCircle2 size={15} className="passed"/>:<XCircle size={15} className="failed"/>}
     <span className="owunit-result-desc"><b>{test.name}</b>{test.message&&<small>{test.message}</small>}<small className="owunit-result-file">{test.file}</small></span>
    </button>)}
    {!report.results.length&&<div className="owunit-empty-details">No executed test cases were reported. Check the OWUnit output for a missing test directory, unsupported compiler, or parsing failure.</div>}
   </div>
   <button className="owunit-output-toggle" onClick={()=>setShowOutput(v=>!v)}>{showOutput?<ChevronDown size={13}/>:<ChevronRight size={13}/>} {showOutput?'Hide':'Show'} OWUnit console output</button>
   {showOutput&&<pre className="owunit-output">{report.output}</pre>}
  </div>}
 </div>;
}
