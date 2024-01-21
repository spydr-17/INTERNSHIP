const bcrypt = require("bcrypt");
const User = require("../models/User");
const OTP = require("../models/OTP");
const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");
const mailSender = require("../utils/mailSender");
const Profile=require("../models/Profile")
// const { passwordUpdated } = require("../mail/templates/passwordUpdate");
require("dotenv").config();


//signUp
const signUp = async (req, res) => {
    try{
        const{firstName, lastName, email, password, confirmPassword, accountType,registrationNumber, otp} = req.body;                                   
    
        if(!firstName || !lastName || !email || !password || !confirmPassword ||!registrationNumber|| !accountType ||!otp){                //validate krlo means all inbox are filled or not;
                return res.status(403).json({
                    success:false,
                    message:"All fields are required",
                })
           }
        if(password !== confirmPassword){                                            //both password must be matched 
            return res.status(400).json({
                success:false,
                message:'Password and ConfirmPassword Value does not match, please try again',
            });
        }
        const existingUser = await User.findOne({registrationNumber});                   //check user already exist or not
        if(existingUser){
            return res.status(400).json({
                success:false,
                message:'User is already registered',
            });
        }

        const response = await OTP.find({email}).sort({createdAt: -1}).limit(1);               //find most recent OTP stored for the user or most recent OTP generated for user;
       
        if(response.length === 0){                                //validate OTP , Lenght 0 so OTP not found
            return res.status(400).json({ 
                success:false,
                message:'OTP NOT Found',
            })}
        else if(otp !== response[0].otp){                           // if otp entered by user != actual otp then PRINT Invalid OTP;
            return res.status(400).json({                          // here otp is entered by user and response[0].otp is generated by controller;
                success:false,
                message:"Invalid OTP",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);          //Hashed the password
      
        
        //created entry in Profile in DB
        const profileDetails = await Profile.create({
            gender:null,
            dateOfBirth: null,
            panCard:null,
            aadharNo:null,
            passportAttachment:null,
            linkedInProfile:null,
            amcat:null ,             //TODO
            disability:null,
            aggregateCGPAAttachment:null,
            twelfthPercentAttachment:null,
            tenthPercentAttachment:null,
            prnNumber:null,
            branch:null,
            middleName:null,
            contactNumber:null,

        });
         //created entry in User in DB
        const user = await User.create({
            firstName,
            lastName,
            email,
            registrationNumber,
            password:hashedPassword,
            accountType: accountType,
			
            additionalDetails:profileDetails._id,
            image: `https://api.dicebear.com/5.x/initials/svg?seed=${firstName} ${lastName}`,
        })
  
        return res.status(200).json({                      //return res
            success:true,
            user,
            message:'User is registered Successfully',
        });
    }
    catch(error) {
        console.log(error);
        return res.status(500).json({
            success:false,
            message:"User cannot be registrered. Please try again",
        })
    }
}


//Login
const login = async (req, res) => {
    try {
        const {registrationNumber, password} = req.body;                  //get data from req body
      
        if(!registrationNumber || !password){                             // validate krlo means all inbox are filled or not;
            return res.status(403). json({
                success:false,
                message:'Please Fill up All the Required Fields',
            });
        }
        
        const user = await User.findOne({registrationNumber}).populate("additionalDetails");          //user check exist or not
        if(!user){
            return res.status(401).json({
                success:false,
                message:"User is not registrered, please signup first",
            });
        }
        
        if(await bcrypt.compare(password, user.password)){                    //generate JWT, after password matching/comparing
            const payload = {                                                 // generate payload;
                registrationNumber: user.registrationNumber,
                id: user._id,
                accountType:user.accountType,
            }
            const token = jwt.sign(payload, process.env.JWT_SECRET, {         // generate token (combination of header , payload , signature) 
                expiresIn:"20h",                                               // set expiry time;
            });
            user.token = token;
            user.password= undefined;

            const options = {                                               //create cookie and send response
                expires: new Date(Date.now() + 3*24*60*60*1000),
                httpOnly:true,
            }
            res.cookie("token", token, options).status(200).json({
                success:true,
                token,
                user,
                message:'Logged in successfully',
            })
      }
        else {
            return res.status(401).json({
                success:false,
                message:'Password is incorrect',
            });
        }
    }
    catch(error) {
        console.log(error);
        return res.status(500).json({
            success:false,
            message:'Login Failure, please try again',
        });
    }
};


//sendOTP
const sendOTP = async (req, res) =>  {

    try {
        const {email} = req.body;                                     //fetch email from request ki body
        const checkUserPresent = await User.findOne({email});        //check if user already exist

        if(checkUserPresent) {                                      //if user already exist , then return a response
            return res.status(401).json({
                success:false,
                message:'User already registered',
            })
        }

        var otp = otpGenerator.generate(6, {                       //generate otp of 6 digit number donot contain uppercase,lowercase,specialchar; 
            upperCaseAlphabets:false,
            lowerCaseAlphabets:false,
            specialChars:false,
        });
        console.log("OTP generated: ", otp );

        let result = await OTP.findOne({otp: otp});               //check unique otp or not
        while(result){                                            // if result is true so we regenerate otp;
            otp = otpGenerator.generate(6, {
				upperCaseAlphabets: false,
			});
        }

        const otpPayload = {email, otp};

        //create an entry in OTP in DB and this OTP is used in SignUp to find response;
        const otpBody = await OTP.create(otpPayload);
        console.log("OTP Body", otpBody);

        res.status(200).json({                                     //return response successful
            success:true,
            message:'OTP Sent Successfully',
            otp,
        })
    }
    catch(error) {
        console.log(error);
        return res.status(500).json({
            success:false,
            message:error.message,
        })
    }

};


// Controller for Changing Password
const changePassword = async (req, res) => {
	try {
		const userDetails = await User.findById(req.user.id);                         // Get user data from req.user
		const { oldPassword, newPassword, confirmNewPassword } = req.body;            // Get old password, new password, and confirm new password from req.body

		const isPasswordMatch = await bcrypt.compare(oldPassword, userDetails.password );                 // Validate old password
			 
		if(!isPasswordMatch) {                                  // If old password does not match, return a 401 (Unauthorized) error
			return res.status(401).json({ success: false, message: "The password is incorrect" });	 
		}

		if(newPassword !== confirmNewPassword) {                             // Match new password and confirm new password
            return res.status(401).json({ success: false, message: "The password and confirm password does not match" });	 
		}
			 
		const encryptedPassword = await bcrypt.hash(newPassword, 10);             // Update password
		const updatedUserDetails = await User.findByIdAndUpdate(req.user.id , { password: encryptedPassword } , { new: true });
                                                                                  // find user by id and then update password = encryptedPassword , here if you "const updatedUserDetails =" does not wirte this then also it not affect;
		 
		try {                                                          // Send notification email , here passwordUpdated is template of email which is send to user;
			const emailResponse = await mailSender(updatedUserDetails.email, passwordUpdated(updatedUserDetails.email, `Password updated successfully for ${updatedUserDetails.firstName} ${updatedUserDetails.lastName}`));
			console.log("Email sent successfully:", emailResponse.response);
		   } 
        catch(error) {
			return res.status(500).json({
				success: false,
				message: "Error occurred while sending email",
				error: error.message,
			});
		}

		return res.status(200).json({ success: true, message: "Password updated successfully" });         // Return success response 	 
	 } 
    catch(error) {
		console.error("Error occurred while updating password:", error);
		return res.status(500).json({
			success: false,
			message: "Error occurred while updating password",
			error: error.message,
		});
	}
};


module.exports =  {signUp , login , sendOTP , changePassword};

 
