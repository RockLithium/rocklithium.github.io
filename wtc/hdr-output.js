import * as THREE from 'three/webgpu';
import {Fn,select,vec3,max,pow,sqrt,log} from 'three/tsl';
export const P3='display-p3';
// r186 supports custom primaries; keep its own color-conversion shader path.
export function registerDisplayP3() {
  if(THREE.ColorManagement.spaces[P3])return;
  THREE.ColorManagement.define({[P3]:{
    primaries:[.680,.320,.265,.690,.150,.060],whitePoint:[.3127,.3290],transfer:THREE.SRGBTransfer,
    toXYZ:new THREE.Matrix3().set(.486570949,.265667693,.198217285,.228974564,.691738522,.079286914,0,.045113382,1.043944369),
    fromXYZ:new THREE.Matrix3().set(2.493496912,-.931383618,-.402710785,-.829488970,1.762664060,.023624686,.035845830,-.076172389,.956884524),
    luminanceCoefficients:[.228974564,.691738522,.079286914],
    outputColorSpaceConfig:{drawingBufferColorSpace:P3,toneMappingMode:'extended'},
  }});
}
export const hdrShoulder=Fn(([color])=>{
  const x=max(color,vec3(0)).mul(1.8),boosted=x.add(max(x.sub(.6),vec3(0)).mul(.5));
  const signal=pow(max(select(boosted.lessThanEqual(1/12),sqrt(boosted.mul(3)),log(max(boosted.mul(12).sub(.28466892),vec3(1e-6))).mul(.17883277).add(.55991073)),vec3(0)),vec3(1.8));
  return select(signal.lessThanEqual(.04045),signal.div(12.92),pow(signal.add(.055).div(1.055),vec3(2.4)));
});
