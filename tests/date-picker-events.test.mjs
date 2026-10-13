import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute actual screen hooks and picker handlers against inert native views.
// Installed native adapters are inspected separately; this is not a native build.
function host() {
  const slots=[]; let cursor=0;
  const react={
    createElement:(type,props,...children)=>({type,props:{...props,children:children.flat(Infinity)}}),
    useState(initial) { const i=cursor++; if (!(i in slots)) slots[i]=typeof initial==='function'?initial():initial; return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}]; },
    useRef(initial) { return react.useState({current:initial})[0]; },
    useMemo:fn=>fn(),useCallback:fn=>fn,useEffect(){},
  };
  return {react,render(fn){cursor=0;return fn();}};
}
function load(file,mocks={}) {
  const exports={};
  runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{
    exports,require:id=>{assert.ok(id in mocks,`Unexpected import ${id}`);return mocks[id];},console,
  });
  return exports;
}
const dates=load('mobile/src/utils/dateHelpers.ts');
const money=load('mobile/src/utils/money.ts');
function nodes(tree,predicate) {
  if (!tree||typeof tree!=='object') return [];
  return [...(predicate(tree)?[tree]:[]),...(tree.props?.children??[]).flatMap(child=>nodes(child,predicate))];
}
function button(tree,label) {
  const result=nodes(tree,n=>n.type==='TouchableOpacity'&&nodes(n,t=>t.type==='Text'&&t.props.children.includes(label)).length)[0];
  assert.ok(result,`Button ${label}`);return result;
}
function picker(tree) {
  const result=nodes(tree,n=>n.type==='DateTimePicker');assert.equal(result.length,1);
  assert.equal(result[0].props.onChange,undefined,'deprecated callback is absent');
  assert.equal(typeof result[0].props.onValueChange,'function');assert.equal(typeof result[0].props.onDismiss,'function');
  return result[0];
}
function fixture(platform,kind,endDate) {
  const h=host();
  const row={id:'rec',transaction:{type:'income',amount:1.23,description:'Test'},frequency:'monthly',startDate:'2024-01-01',endDate};
  const state={transactions:[],buckets:[],budgets:[],recurringTransactions:[row]};
  const mocks={
    react:h.react,'react-native':{
      ...Object.fromEntries(['View','Text','TextInput','TouchableOpacity','ScrollView','KeyboardAvoidingView','ActivityIndicator','FlatList','Modal'].map(name=>[name,name])),
      Platform:{OS:platform},StyleSheet:{create:value=>value},Alert:{alert(){}},
    },
    '@react-native-community/datetimepicker':'DateTimePicker',
    '../contexts/ThemeContext':{useTheme:()=>({theme:{colors:{},fontSize:{},spacing:{},borderRadius:{}}})},
    '../contexts/AppStateContext':{useAppState:()=>({state})},
    '../contexts/ToastContext':{useToast:()=>({})},'../contexts/AuthContext':{useAuth:()=>({user:{id:'A'}})},
    '../utils/dateHelpers':dates,'../utils/money':money,'../utils/storage':{generateId:()=> 'unused'},
    '../utils/haptics':{hapticSelection(){},hapticLight(){},hapticError(){},hapticSuccess(){}},
    '../utils/duplicateDetection':{checkForDuplicates:()=>null},'../components/TransactionTemplatesSection':'Templates',
    '../utils/mutationAttempt':{useMutationAttempt:()=>({pending:false,error:null,clear(){},run(){}})},
  };
  const component=load(`mobile/src/screens/${kind}Screen.tsx`,mocks).default;
  if (kind==='TransactionForm') return {render:()=>h.render(()=>component({route:{params:{initialDate:'2024-01-01'}},navigation:{}}))};
  const inner=component();const render=()=>h.render(()=>inner.type(inner.props));
  nodes(render(),n=>n.type==='FlatList')[0].props.renderItem({item:row}).props.onPress();
  return {render};
}
const selected=()=>dates.parseIsoDateLocal('2024-02-29');
const selectedEvent=date=>({nativeEvent:{timestamp:date.getTime(),utcOffset:0}});
function select(render) {
  const p=picker(render()),date=selected();p.props.onValueChange(selectedEvent(date),date);
}
function assertSelectionVisibility(render,platform) {
  assert.equal(nodes(render(),n=>n.type==='DateTimePicker').length,platform==='ios'?1:0);
  if (platform==='ios') assert.equal(picker(render()).props.display,'inline');
}

for (const platform of ['android','ios']) {
  test(`${platform}: transaction picker selects local day, closes only Android and dismissal keeps the date`,()=>{
    const {render}=fixture(platform,'TransactionForm');
    button(render(),dates.formatDate('2024-01-01')).props.onPress();
    picker(render()).props.onDismiss();
    assert.equal(nodes(render(),n=>n.type==='DateTimePicker').length,0);
    button(render(),dates.formatDate('2024-01-01')).props.onPress();select(render);assertSelectionVisibility(render,platform);
    button(render(),dates.formatDate('2024-02-29')).props.onPress();
    assert.equal(dates.formatIsoDateLocal(picker(render()).props.value),'2024-02-29');
    picker(render()).props.onDismiss();
    assert.equal(nodes(render(),n=>n.type==='DateTimePicker').length,0);assert.ok(button(render(),dates.formatDate('2024-02-29')));
  });
  test(`${platform}: recurring start picker preserves cancellation and selected leap day`,()=>{
    const {render}=fixture(platform,'Recurring');
    button(render(),dates.formatDate('2024-01-01')).props.onPress();picker(render()).props.onDismiss();
    assert.ok(button(render(),dates.formatDate('2024-01-01')));
    button(render(),dates.formatDate('2024-01-01')).props.onPress();select(render);assertSelectionVisibility(render,platform);
    button(render(),dates.formatDate('2024-02-29')).props.onPress();
    assert.equal(dates.formatIsoDateLocal(picker(render()).props.value),'2024-02-29');picker(render()).props.onDismiss();
    assert.equal(nodes(render(),n=>n.type==='DateTimePicker').length,0);assert.ok(button(render(),dates.formatDate('2024-02-29')));
  });
  test(`${platform}: recurring end dismissal never fills an empty end date or changes an existing date`,()=>{
    for (const initial of [undefined,'2024-03-31']) {
      const {render}=fixture(platform,'Recurring',initial);
      if (!initial) button(render(),'Set end date').props.onPress();
      const label=initial?dates.formatDate(initial):'Select date';
      button(render(),label).props.onPress();picker(render()).props.onDismiss();
      assert.equal(nodes(render(),n=>n.type==='DateTimePicker').length,0);assert.ok(button(render(),label));
      button(render(),label).props.onPress();select(render);assertSelectionVisibility(render,platform);
      button(render(),dates.formatDate('2024-02-29')).props.onPress();
      assert.equal(dates.formatIsoDateLocal(picker(render()).props.value),'2024-02-29');picker(render()).props.onDismiss();
      assert.ok(button(render(),dates.formatDate('2024-02-29')));
    }
  });
}
